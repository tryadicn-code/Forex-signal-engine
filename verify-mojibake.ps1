# verify-mojibake.ps1 v2 - pure ASCII source, build patterns from codepoints
Set-Location "C:\Users\user_not_found\Documents\Codex\FOREX (CHATGPT)"
$repoRoot = $PWD.Path

# Codepoints of mojibake lead/continuation chars (UTF-8 bytes decoded as cp1252)
$yen = [char]0x00A5
$curren = [char]0x00A4
$c2 = [char]0x00C2   # Â
$c3 = [char]0x00C3   # Ã
$e2 = [char]0x00E2   # â
$euro = [char]0x20AC # €
$sbquo = [char]0x201A # ‚
$fnof = [char]0x0192  # ƒ
$bdquo = [char]0x201E # „
$hellip = [char]0x2026 # …
$dagger = [char]0x2020 # †
$ddagger = [char]0x2021 # ‡
$circ = [char]0x02C6  # ˆ
$permil = [char]0x2030 # ‰
$lsaquo = [char]0x2039 # ‹
$oelig = [char]0x0152 # Œ
$zcar = [char]0x017D  # Ž
$lsquo = [char]0x2018 # '
$rsquo = [char]0x2019 # '
$ldquo = [char]0x201C # "
$rdquo = [char]0x201D # "
$bull = [char]0x2022  # •
$endash = [char]0x2013 # –
$emdash = [char]0x2014 # —
$tilde = [char]0x02DC # ˜
$trade = [char]0x2122 # ™
$scaron = [char]0x0161 # š
$rsaquo = [char]0x203A # ›
$oelig2 = [char]0x0153 # œ
$zcar2 = [char]0x017E  # ž
$yuml = [char]0x0178  # Ÿ

# Patterns: each is a common double-encoded UTF-8 signature
$patterns = @(
  @{ name = "emdash";   pat = $e2 + $euro + $emdash },
  @{ name = "endash";   pat = $e2 + $euro + $endash },
  @{ name = "bullet";   pat = $e2 + $euro + $bull },
  @{ name = "hellip";   pat = $e2 + $euro + $hellip },
  @{ name = "rsaquo";   pat = $e2 + $euro + $rsaquo },
  @{ name = "lsaquo";   pat = $e2 + $euro + $lsaquo },
  @{ name = "checkmark";pat = $c3 + $a2 + $hellip + $trade },
  @{ name = "middot";   pat = $c2 + $bull },
  @{ name = "xmark";    pat = $e2 + $euro + $ldquo + $bull },
  @{ name = "circle";   pat = $e2 + $euro + $rdquo },
  @{ name = "diamond";  pat = $e2 + $euro + $dagger },
  @{ name = "rsquo";    pat = $e2 + $euro + $trade },
  @{ name = "ge";       pat = $e2 + $euro + $permil }
)

Write-Host "===== Scanning src\ for mojibake =====" -ForegroundColor Cyan
Write-Host ""

$total = 0
$hits = @()

$files = @()
$files += Get-ChildItem -Recurse -Path "src" -Filter "*.tsx" -File
$files += Get-ChildItem -Recurse -Path "src" -Filter "*.ts" -File |
  Where-Object { $_.Name -notmatch '\.test\.ts$' }

foreach ($file in $files) {
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  $rel = $file.FullName.Substring($repoRoot.Length + 1)

  foreach ($p in $patterns) {
    $count = ([regex]::Matches($text, [regex]::Escape($p.pat))).Count
    if ($count -gt 0) {
      Write-Host "  [$($p.name)] $rel : $count" -ForegroundColor Yellow
      $total += $count
      $hits += [PSCustomObject]@{ File = $rel; Pattern = $p.name; Count = $count }
    }
  }
}

Write-Host ""
if ($total -eq 0) {
  Write-Host "[CLEAN] No mojibake found in src/" -ForegroundColor Green
  Write-Host ""
  Write-Host "Kemungkinan mojibake yang terlihat di audit hanya artifact dari copy-paste." -ForegroundColor DarkGray
} else {
  Write-Host "[DIRTY] Total $total occurrence(s)" -ForegroundColor Red
  Write-Host ""
  Write-Host "Detail:" -ForegroundColor Cyan
  $hits | Format-Table -AutoSize | Out-String | Write-Host
}