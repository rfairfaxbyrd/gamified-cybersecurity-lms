/**
 * What this file does
 * - Stores the educational content and level configuration for Cyber Crush.
 * - This includes:
 *   - which tiles appear in each level
 *   - the plain-English descriptions shown in the side panel
 *   - the expected icon filenames under `/content/cyber-crush/icons`
 *
 * How icon assets are loaded from the content folder
 * - Each tile declares an `assetPath` like `cyber-crush/icons/worm.png`.
 * - The page route resolves those paths into URLs under `/api/content/...`.
 * - If an icon file is missing, the UI falls back to a colored labeled tile.
 *
 * How to replace or add custom icons later
 * - Put your PNG files in:
 *   `content/cyber-crush/icons/`
 * - Keep the expected filenames from this file, or update the `assetPath` values below.
 */

export type CyberCrushTileDefinition = {
  kind: string;
  label: string;
  shortLabel: string;
  description: string;
  assetPath: string;
  fallbackGradient: string;
};

export type CyberCrushLevelDefinition = {
  id: string;
  title: string;
  subtitle: string;
  objectiveLabel: string;
  moveLimit: number;
  targetScore: number;
  tiles: CyberCrushTileDefinition[];
};

export type CyberCrushTilePresentation = CyberCrushTileDefinition & {
  iconUrl: string | null;
};

export type CyberCrushLevelPresentation = Omit<CyberCrushLevelDefinition, "tiles"> & {
  tiles: CyberCrushTilePresentation[];
};

export const CYBER_CRUSH_LEVELS: CyberCrushLevelDefinition[] = [
  {
    id: "malware-icons",
    title: "Level 1: Malware Icons",
    subtitle: "Learn common malware types while making quick 3-match combos.",
    objectiveLabel: "Reach 1300 points in 14 moves.",
    moveLimit: 14,
    targetScore: 1300,
    tiles: [
      {
        kind: "worm",
        label: "Worm",
        shortLabel: "WRM",
        description: "Self-replicating malware that spreads across systems.",
        assetPath: "cyber-crush/icons/worm.png",
        fallbackGradient: "linear-gradient(135deg, #7f1d1d 0%, #be123c 100%)"
      },
      {
        kind: "virus",
        label: "Virus",
        shortLabel: "VRS",
        description: "Malware that attaches to files or programs.",
        assetPath: "cyber-crush/icons/virus.png",
        fallbackGradient: "linear-gradient(135deg, #7c2d12 0%, #ea580c 100%)"
      },
      {
        kind: "trojan",
        label: "Trojan",
        shortLabel: "TRJ",
        description: "Malware disguised as legitimate software.",
        assetPath: "cyber-crush/icons/trojan.png",
        fallbackGradient: "linear-gradient(135deg, #78350f 0%, #d97706 100%)"
      },
      {
        kind: "adware",
        label: "Adware",
        shortLabel: "AD",
        description: "Unwanted software that displays ads.",
        assetPath: "cyber-crush/icons/adware.png",
        fallbackGradient: "linear-gradient(135deg, #1d4ed8 0%, #06b6d4 100%)"
      },
      {
        kind: "spyware",
        label: "Spyware",
        shortLabel: "SPY",
        description: "Software that secretly collects user information.",
        assetPath: "cyber-crush/icons/spyware.png",
        fallbackGradient: "linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)"
      },
      {
        kind: "ransomware",
        label: "Ransomware",
        shortLabel: "RAN",
        description: "Malware that locks or encrypts files for payment.",
        assetPath: "cyber-crush/icons/ransomware.png",
        fallbackGradient: "linear-gradient(135deg, #374151 0%, #111827 100%)"
      }
    ]
  },
  {
    id: "security-icons",
    title: "Level 2: Security Icons",
    subtitle: "Shift from threats to defenses and protect the board.",
    objectiveLabel: "Reach 1700 points in 14 moves.",
    moveLimit: 14,
    targetScore: 1700,
    tiles: [
      {
        kind: "firewall",
        label: "Firewall",
        shortLabel: "FW",
        description: "Filters network traffic to block suspicious connections.",
        assetPath: "cyber-crush/icons/firewall.png",
        fallbackGradient: "linear-gradient(135deg, #b91c1c 0%, #f97316 100%)"
      },
      {
        kind: "shield",
        label: "Shield",
        shortLabel: "SHD",
        description: "A simple symbol for general protection and defense.",
        assetPath: "cyber-crush/icons/shield.png",
        fallbackGradient: "linear-gradient(135deg, #1d4ed8 0%, #38bdf8 100%)"
      },
      {
        kind: "lock",
        label: "Lock",
        shortLabel: "LCK",
        description: "Represents strong account protection and secure access.",
        assetPath: "cyber-crush/icons/lock.png",
        fallbackGradient: "linear-gradient(135deg, #334155 0%, #6366f1 100%)"
      },
      {
        kind: "mfa",
        label: "MFA",
        shortLabel: "MFA",
        description: "Multi-factor authentication adds another proof of identity.",
        assetPath: "cyber-crush/icons/mfa.png",
        fallbackGradient: "linear-gradient(135deg, #581c87 0%, #a855f7 100%)"
      },
      {
        kind: "patch",
        label: "Patch",
        shortLabel: "PCH",
        description: "Software updates that fix vulnerabilities and bugs.",
        assetPath: "cyber-crush/icons/patch.png",
        fallbackGradient: "linear-gradient(135deg, #92400e 0%, #f59e0b 100%)"
      },
      {
        kind: "antivirus",
        label: "Antivirus",
        shortLabel: "AV",
        description: "Security software that detects and removes known threats.",
        assetPath: "cyber-crush/icons/antivirus.png",
        fallbackGradient: "linear-gradient(135deg, #0f766e 0%, #06b6d4 100%)"
      }
    ]
  }
];
