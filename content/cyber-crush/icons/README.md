# Cyber Crush Icons

Place Cyber Crush PNG assets in this folder.

Expected malware filenames:
- `worm.png`
- `virus.png`
- `trojan.png`
- `adware.png`
- `spyware.png`
- `ransomware.png`

Expected security filenames:
- `firewall.png`
- `shield.png`
- `lock.png`
- `mfa.png`
- `patch.png`
- `antivirus.png`

How the LMS uses these files:
- The native Cyber Crush module checks whether each file exists.
- If a file exists, the game loads it through `/api/content/cyber-crush/icons/<filename>`.
- If a file is missing, the game safely falls back to a labeled colored tile instead of crashing.

Recommended format:
- PNG with transparent background
- Square canvas (for example `256x256` or `512x512`)
