/**
 * What this file does
 * - Stores the question set for Cyber Hill Climber.
 * - Each question represents one "mountain step" the player must clear.
 *
 * How the game flow works
 * - The player sees one question at a time.
 * - Each question has exactly two answer choices.
 * - One choice is safer from a cybersecurity perspective.
 * - A correct answer advances the climb.
 * - A wrong answer ends the run immediately.
 *
 * How to edit or add questions later
 * - Add or change entries in `CYBER_HILL_QUESTIONS`.
 * - Keep the wording plain-English and beginner-friendly.
 * - Keep exactly 2 choices per question for the current MVP.
 */

export type CyberHillChoice = {
  id: string;
  label: string;
  isCorrect: boolean;
};

export type CyberHillQuestion = {
  id: string;
  prompt: string;
  successExplanation: string;
  failureExplanation: string;
  choices: [CyberHillChoice, CyberHillChoice];
};

export const CYBER_HILL_QUESTIONS: CyberHillQuestion[] = [
  {
    id: "password-passphrase",
    prompt: "You need a new password for an important account. Which choice is safer?",
    successExplanation: "A longer passphrase is harder to guess and easier to remember safely.",
    failureExplanation: "Short, predictable passwords are much easier for attackers to crack or reuse.",
    choices: [
      {
        id: "safe",
        label: "Use a long passphrase like River-Hike-Lantern-Cloud",
        isCorrect: true
      },
      {
        id: "risky",
        label: "Use Seton123 because it is quick to type",
        isCorrect: false
      }
    ]
  },
  {
    id: "attachment-check",
    prompt: "You receive an unexpected file attachment from someone you know. What is safer?",
    successExplanation: "Unexpected attachments should be verified before you open them.",
    failureExplanation: "Opening unexpected files right away can trigger malware or account compromise.",
    choices: [
      {
        id: "safe",
        label: "Verify with the sender first using another trusted method",
        isCorrect: true
      },
      {
        id: "risky",
        label: "Open it immediately because the sender name looks familiar",
        isCorrect: false
      }
    ]
  },
  {
    id: "mfa-choice",
    prompt: "You can turn on MFA for your account. Which option is safer?",
    successExplanation: "MFA adds another layer of protection beyond just a password.",
    failureExplanation: "Skipping MFA makes it much easier for a stolen password to be enough on its own.",
    choices: [
      {
        id: "safe",
        label: "Turn on MFA with an authenticator app",
        isCorrect: true
      },
      {
        id: "risky",
        label: "Leave MFA off because your password is probably enough",
        isCorrect: false
      }
    ]
  },
  {
    id: "phishing-link",
    prompt: "You get an email saying your account needs urgent action. Which is safer?",
    successExplanation: "Going directly to the official site helps avoid phishing links.",
    failureExplanation: "Urgent links in emails are a common phishing tactic.",
    choices: [
      {
        id: "safe",
        label: "Go to the official website yourself instead of clicking the email link",
        isCorrect: true
      },
      {
        id: "risky",
        label: "Click the email link right away before the deadline passes",
        isCorrect: false
      }
    ]
  },
  {
    id: "ai-chatbot-data",
    prompt: "Is it okay to paste confidential information into an AI chatbot?",
    successExplanation: "Sensitive information should stay out of public AI tools unless your organization explicitly approves it.",
    failureExplanation: "Confidential data can be exposed, retained, or reused in ways you do not expect.",
    choices: [
      {
        id: "safe",
        label: "No — keep confidential or protected data out unless it is explicitly approved",
        isCorrect: true
      },
      {
        id: "risky",
        label: "Yes — it is fine as long as the chatbot helps you work faster",
        isCorrect: false
      }
    ]
  },
  {
    id: "shared-device",
    prompt: "You used a shared school or work computer. What is safer before you leave?",
    successExplanation: "Signing out and not saving credentials helps protect your account on shared devices.",
    failureExplanation: "Leaving sessions open on shared devices lets the next person use your account.",
    choices: [
      {
        id: "safe",
        label: "Sign out fully and do not save your password in the browser",
        isCorrect: true
      },
      {
        id: "risky",
        label: "Just close the browser tab and assume that is enough",
        isCorrect: false
      }
    ]
  },
  {
    id: "public-wifi",
    prompt: "You need to check an important account on public Wi‑Fi. Which is safer?",
    successExplanation: "Using a trusted connection or extra protection lowers the chance of account theft.",
    failureExplanation: "Sensitive logins over open public Wi‑Fi carry more risk.",
    choices: [
      {
        id: "safe",
        label: "Use a trusted hotspot or protected connection before signing in",
        isCorrect: true
      },
      {
        id: "risky",
        label: "Log in over the open network because it is probably fine for a minute",
        isCorrect: false
      }
    ]
  }
];
