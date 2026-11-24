# Petit serveur de la facturation Ets Barry, sur cet ordinateur seulement (127.0.0.1, sans internet).
# Il donne la page a Edge et garde les factures dans donnees-factures.json, a cote de ce fichier.
# Lance par « Ouvrir Facturation.bat ». Compatible Windows PowerShell 5.1 (Windows 10).
$ErrorActionPreference = 'Stop'
$dossier = Split-Path -Parent $MyInvocation.MyCommand.Path
$page = Join-Path $dossier 'Ets-Barry-Facturation-hors-ligne.html'
$donnees = Join-Path $dossier 'donnees-factures.json'
$sauvegardes = Join-Path $dossier 'sauvegardes'
$port = 8765
$utf8 = New-Object System.Text.UTF8Encoding($false)
$journal = Join-Path $dossier 'serveur-journal.txt'
function Journal($texte) {
  try { Add-Content -LiteralPath $journal -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $texte) } catch { }
}

try {
  $ecoute = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
  $ecoute.Start()
  Journal 'Serveur demarre sur http://localhost:8765/'
} catch {
  Journal ('Port 8765 deja utilise (serveur deja lance ?) : ' + $_)
  exit 0  # deja lance : le serveur existant suffit
}

function Envoyer($flux, $statut, $type, [byte[]]$octets) {
  $tete = "HTTP/1.1 $statut`r`nContent-Type: $type`r`nContent-Length: $($octets.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $tb = [System.Text.Encoding]::ASCII.GetBytes($tete)
  $flux.Write($tb, 0, $tb.Length)
  if ($octets.Length -gt 0) { $flux.Write($octets, 0, $octets.Length) }
  $flux.Flush()
}

while ($true) {
  $client = $ecoute.AcceptTcpClient()
  try {
    $client.ReceiveTimeout = 3000
    $client.SendTimeout = 10000
    $flux = $client.GetStream()

    # En-tetes : lus octet par octet jusqu'a la ligne vide.
    $entete = New-Object System.Collections.Generic.List[byte]
    while ($true) {
      $b = $flux.ReadByte()
      if ($b -lt 0) { break }
      $entete.Add([byte]$b)
      $n = $entete.Count
      if ($n -ge 4 -and $entete[$n - 4] -eq 13 -and $entete[$n - 3] -eq 10 -and $entete[$n - 2] -eq 13 -and $entete[$n - 1] -eq 10) { break }
      if ($n -gt 65536) { break }
    }
    if ($entete.Count -eq 0) { continue }
    $lignes = [System.Text.Encoding]::ASCII.GetString($entete.ToArray()) -split "`r`n"
    $premiere = $lignes[0] -split ' '
    if ($premiere.Count -lt 2) { continue }
    $methode = $premiere[0]
    $chemin = $premiere[1]
    $longueur = 0
    foreach ($l in $lignes) {
      if ($l -match '^Content-Length:\s*(\d+)') { $longueur = [int]$Matches[1] }
    }

    # Corps (pour l'enregistrement des donnees).
    $corps = New-Object byte[] $longueur
    $lu = 0
    while ($lu -lt $longueur) {
      $r = $flux.Read($corps, $lu, $longueur - $lu)
      if ($r -le 0) { break }
      $lu += $r
    }

    if ($methode -eq 'GET' -and ($chemin -eq '/' -or $chemin.StartsWith('/?'))) {
      Envoyer $flux '200 OK' 'text/html; charset=utf-8' ([System.IO.File]::ReadAllBytes($page))
    }
    elseif ($methode -eq 'GET' -and $chemin.StartsWith('/donnees')) {
      if (Test-Path -LiteralPath $donnees) { $octets = [System.IO.File]::ReadAllBytes($donnees) } else { $octets = $utf8.GetBytes('null') }
      Envoyer $flux '200 OK' 'application/json; charset=utf-8' $octets
    }
    elseif ($methode -eq 'POST' -and $chemin.StartsWith('/donnees') -and $lu -eq $longueur -and $longueur -gt 0) {
      # Ecriture sure : fichier temporaire puis remplacement, et une copie par jour dans « sauvegardes ».
      $tmp = $donnees + '.tmp'
      [System.IO.File]::WriteAllBytes($tmp, $corps)
      if (Test-Path -LiteralPath $donnees) { Remove-Item -LiteralPath $donnees -Force }
      Move-Item -LiteralPath $tmp -Destination $donnees -Force
      if (-not (Test-Path -LiteralPath $sauvegardes)) { New-Item -ItemType Directory -Path $sauvegardes | Out-Null }
      $jour = Join-Path $sauvegardes ('donnees-' + (Get-Date -Format 'yyyy-MM-dd') + '.json')
      Copy-Item -LiteralPath $donnees -Destination $jour -Force
      Envoyer $flux '200 OK' 'text/plain; charset=utf-8' ($utf8.GetBytes('ok'))
    }
    else {
      Envoyer $flux '404 Not Found' 'text/plain; charset=utf-8' ($utf8.GetBytes('introuvable'))
    }
  }
  catch {
    if (-not ($_.Exception -is [System.IO.IOException])) { Journal ('Erreur : ' + $_) }
    try { Envoyer $flux '500 Internal Server Error' 'text/plain; charset=utf-8' ($utf8.GetBytes([string]$_)) } catch { }
  }
  finally {
    $client.Close()
  }
}
