'use strict';

/**
 * The 90-day CISSP study plan, expressed as data.
 *
 * Weeks 1-12 follow the community-standard cadence:
 *   - ~1.5-2 h/day, six days a week, ~135 h total
 *   - Weeks 1-10: domain study
 *   - Week 11:    full-length practice exams + weakness remediation
 *   - Week 12:    refresher + rest + exam
 *   - Days 85-90: buffer (push the exam here if any domain scored < 70 %)
 *
 * Three weekly checkpoints are baked into every week:
 *   - Wednesday quiz      (30 min, 25 questions on the current domain)
 *   - Saturday timed block (90 min, 50 mixed questions from every domain so far)
 *   - Sunday review        (60 min, re-read the week's notes, no new material)
 */

const WEEKS = [
  {
    week: 1,
    domain: 'Domain 1 — Security and Risk Management',
    weight: '16%',
    difficulty: 'core',
    summary:
      'Biggest domain, two weeks. Read OSG Chapter 1 thoroughly and absorb the "think like a manager" mindset the rest of the exam expects.',
    focus: [
      'CIA triad, security governance, policies / standards / procedures / guidelines',
      'Risk management: threat, vulnerability, likelihood, impact, qualitative vs quantitative (ALE = SLE × ARO)',
      'Business continuity: BCM, BIA, RTO, RPO, MTD',
      'Legal, regulatory and compliance; NDA, SLA; (ISC)² Code of Ethics',
    ],
    acronyms: ['BCM', 'DRP', 'BIA', 'RTO', 'RPO', 'MTD', 'NDA', 'SLA', 'ALE', 'SLE', 'ARO'],
    questionTarget: 150,
  },
  {
    week: 2,
    domain: 'Domain 1 — Security and Risk Management (cont.)',
    weight: '16%',
    difficulty: 'core',
    summary:
      'Finish Domain 1. Security awareness, supply-chain risk, threat modelling (STRIDE, PASTA), personnel security.',
    focus: [
      'Threat modelling: STRIDE, PASTA, attack trees',
      'Supply chain risk management (SCRM), third-party assessment',
      'Personnel security: separation of duties, job rotation, mandatory vacation',
      'Security awareness, education and training programs',
    ],
    acronyms: ['STRIDE', 'PASTA', 'SCRM', 'DREAD'],
    questionTarget: 150,
  },
  {
    week: 3,
    domain: 'Domain 2 — Asset Security',
    weight: '10%',
    difficulty: 'easy',
    summary:
      'Shortest domain. Data classification, data lifecycle, data states, retention, destruction, privacy roles. Should feel almost easy after Domain 1.',
    focus: [
      'Data classification schemes (government vs commercial)',
      'Data lifecycle: create, store, use, share, archive, destroy',
      'Data states: at rest / in transit / in use, and the controls for each',
      'Roles: data owner, data custodian, data processor, data controller, data subject',
      'Sanitisation: clearing, purging, degaussing, destruction',
    ],
    acronyms: ['DLP', 'DRM', 'CASB', 'GDPR'],
    questionTarget: 150,
  },
  {
    week: 4,
    domain: 'Domain 3 — Security Architecture and Engineering',
    weight: '13%',
    difficulty: 'hard',
    summary:
      'Consistently the most-failed domain. Security models and the trusted computing base this week; pair every model with a real-world example.',
    focus: [
      'Bell-LaPadula = military confidentiality (no read up / no write down)',
      'Biba = financial integrity (no read down / no write up)',
      'Clark-Wilson = banking transactions (well-formed transactions, separation of duties)',
      'Brewer-Nash (Chinese Wall) = conflict of interest',
      'TCB, reference monitor, security kernel; Common Criteria EALs',
      'Security capabilities of information systems: memory protection, TPM, HSM, virtualisation',
    ],
    acronyms: ['BLP', 'TCB', 'TPM', 'HSM', 'EAL', 'ICS', 'SCADA', 'IoT'],
    questionTarget: 175,
  },
  {
    week: 5,
    domain: 'Domain 3 — Cryptography (4-5 days)',
    weight: '13%',
    difficulty: 'hard',
    summary:
      'Cryptography deserves 4-5 days on its own. The exam tests specific algorithm strengths, key sizes and use cases.',
    focus: [
      'Symmetric: AES (128/192/256), 3DES, block vs stream, modes (ECB, CBC, CTR, GCM)',
      'Asymmetric: RSA, ECC, Diffie-Hellman, ElGamal; key sizes and use cases',
      'Hashing: SHA-2, SHA-3, MD5 (deprecated); HMAC; collisions and birthday attacks',
      'PKI: CAs, certificates, CRL vs OCSP, key escrow',
      'Digital signatures, non-repudiation, cryptanalysis attack types',
      'Physical security and site design (CPTED, fire suppression, HVAC)',
    ],
    acronyms: ['AES', 'RSA', 'ECC', 'DH', 'PKI', 'CA', 'CRL', 'OCSP', 'HMAC', 'CPTED'],
    questionTarget: 175,
  },
  {
    week: 6,
    domain: 'Domain 4 — Communication and Network Security',
    weight: '13%',
    difficulty: 'core',
    summary:
      'OSI model, TCP/IP, protocols and ports, segmentation, VPNs, wireless, SDN, attack categories. Many questions hinge on which layer an attack or control operates at.',
    focus: [
      'OSI 7 layers vs TCP/IP 4 layers — memorise what lives at each layer',
      'Common ports: 22, 25, 53, 80, 110, 143, 389/636, 443, 445, 3389',
      'Segmentation: VLANs, DMZ, zero trust, micro-segmentation',
      'VPNs: IPsec (AH/ESP, transport vs tunnel), TLS; wireless: WPA2/WPA3, EAP',
      'SDN basics; attacks by layer (ARP spoofing L2, IP spoofing L3, SYN flood L4)',
    ],
    acronyms: ['OSI', 'IPsec', 'AH', 'ESP', 'IKE', 'SDN', 'WPA3', 'EAP', 'VLAN', 'DMZ'],
    questionTarget: 175,
  },
  {
    week: 7,
    domain: 'Domain 5 — Identity and Access Management',
    weight: '13%',
    difficulty: 'core',
    summary:
      'Vocabulary-heavy. Make flashcards for every protocol and standard.',
    focus: [
      'Authentication factors (something you know / have / are), MFA',
      'SSO and federation: SAML, OAuth 2.0, OpenID Connect, Kerberos, RADIUS, TACACS+',
      'Access control models: DAC, MAC, RBAC, ABAC, rule-based',
      'Identity provisioning lifecycle, access reviews, de-provisioning',
      'Privileged access management, just-in-time access',
    ],
    acronyms: ['SAML', 'OAuth', 'OIDC', 'RBAC', 'ABAC', 'MAC', 'DAC', 'PAM', 'IdP', 'SP'],
    questionTarget: 175,
  },
  {
    week: 8,
    domain: 'Domain 6 — Security Assessment and Testing',
    weight: '12%',
    difficulty: 'core',
    summary:
      'Half technical, half governance. Audit strategies, pen-test methodology, vulnerability assessment, log review, code review, breach-attack simulation.',
    focus: [
      'Audit strategies: internal vs external vs third-party; SOC 1 / SOC 2 (Type I vs II)',
      'Penetration testing phases and rules of engagement; black/grey/white box',
      'Vulnerability assessment vs pen test; CVSS',
      'Log review, synthetic transactions, account management testing',
      'Code review, misuse-case testing, test coverage, breach attack simulation',
    ],
    acronyms: ['SOC2', 'CVSS', 'BAS', 'KPI', 'KRI', 'ROE'],
    questionTarget: 175,
  },
  {
    week: 9,
    domain: 'Domain 7 — Security Operations',
    weight: '13%',
    difficulty: 'core',
    summary:
      'The single biggest reasoning-style domain. Incident management, patch and change management, BC/DR, physical security, forensics, threat intelligence.',
    focus: [
      'Incident management steps: detection, response, mitigation, reporting, recovery, remediation, lessons learned',
      'Patch & vulnerability management; change management (CAB)',
      'BC/DR: hot / warm / cold sites, backup types, testing (tabletop → full interruption)',
      'Investigations: digital forensics, evidence handling, chain of custody',
      'Threat intelligence, SIEM, SOAR, logging and monitoring',
    ],
    acronyms: ['SIEM', 'SOAR', 'CAB', 'MTBF', 'MTTR', 'RAID', 'EDR'],
    questionTarget: 175,
  },
  {
    week: 10,
    domain: 'Domain 8 — Software Development Security',
    weight: '10%',
    difficulty: 'hard',
    summary:
      'Second consistently-failed domain. Non-developers find it abstract — work more practice questions here than your time budget suggests.',
    focus: [
      'SDLC models: waterfall, agile, spiral, DevOps / DevSecOps',
      'Security in CI/CD; SAST vs DAST vs IAST vs SCA',
      'OWASP Top 10, secure coding practices, input validation',
      'Database security: inference, aggregation, polyinstantiation',
      'Runtime protection, software acquisition risk, maturity models (CMMI, SAMM)',
    ],
    acronyms: ['SDLC', 'SAST', 'DAST', 'IAST', 'SCA', 'OWASP', 'CMMI', 'SAMM', 'XSS', 'CSRF'],
    questionTarget: 200,
  },
  {
    week: 11,
    domain: 'Full-length practice exams',
    weight: '—',
    difficulty: 'exam',
    summary:
      'Where most candidates discover their actual gaps. Two 125-question, 3-hour timed exams under test conditions. Aim for 75 %+ in every domain; below 70 % in any domain → push the exam back 1-2 weeks.',
    focus: [
      'Sat: practice exam #1 (125 q, 3 h, no phone, no notes, water only) — score by domain',
      'Mon-Fri: 90 min/day re-studying your two weakest domains',
      'Sun: practice exam #2 — aim for 75 %+ across all domains',
    ],
    acronyms: [],
    questionTarget: 250,
  },
  {
    week: 12,
    domain: 'Refresher + rest + exam',
    weight: '—',
    difficulty: 'exam',
    summary:
      'No new material. Watch the exam-cram series, review your own notes, stop early on Friday and sit the exam Saturday morning.',
    focus: [
      'Mon-Wed (1 h/day): Pete Zerger exam-cram videos, light notes',
      'Thu: review your own domain notes only',
      'Fri: light review, stop by 6 pm, watch Kelly Handerhan "Why You Will Pass the CISSP"',
      'Sat morning: sit the exam',
    ],
    acronyms: [],
    questionTarget: 100,
  },
  {
    week: 13,
    domain: 'Buffer (days 85-90)',
    weight: '—',
    difficulty: 'buffer',
    summary:
      'Six spare days. If a domain scored under 70 % in week 11, use these to remediate and retest before sitting the exam. Better to delay 14 days than to fail and wait 30 to retest.',
    focus: [
      'Remediate any domain under 70 %',
      'One more timed 50-question mixed block',
      'Rest',
    ],
    acronyms: [],
    questionTarget: 0,
  },
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function tasksFor(week, dayName) {
  const w = week.week;

  if (w === 11) {
    if (dayName === 'Sat') return [{ text: 'Practice exam #1: 125 questions, 3 h timed, test conditions', minutes: 180, type: 'exam' }, { text: 'Score by domain and record the two weakest', minutes: 20, type: 'review' }];
    if (dayName === 'Sun') return [{ text: 'Practice exam #2: 125 questions, 3 h timed — target 75 %+ per domain', minutes: 180, type: 'exam' }];
    return [{ text: 'Re-study weakest domain #1 (45 min)', minutes: 45, type: 'study' }, { text: 'Re-study weakest domain #2 (45 min)', minutes: 45, type: 'study' }];
  }

  if (w === 12) {
    switch (dayName) {
      case 'Mon':
      case 'Tue':
      case 'Wed':
        return [{ text: 'Watch Pete Zerger exam-cram videos (1 h), light notes', minutes: 60, type: 'review' }];
      case 'Thu':
        return [{ text: 'Review your own domain notes — no new material', minutes: 60, type: 'review' }];
      case 'Fri':
        return [{ text: 'Light review only, stop by 6 pm', minutes: 45, type: 'review' }, { text: 'Watch Kelly Handerhan "Why You Will Pass the CISSP"', minutes: 15, type: 'review' }];
      case 'Sat':
        return [{ text: 'EXAM DAY — sit the CISSP', minutes: 240, type: 'exam' }];
      default:
        return [{ text: 'Rest / celebrate', minutes: 0, type: 'rest' }];
    }
  }

  if (w === 13) {
    if (dayName === 'Sat') return [{ text: 'Timed 50-question mixed block (if still studying)', minutes: 90, type: 'quiz' }];
    return [{ text: 'Remediate any domain under 70 %, or rest', minutes: 60, type: 'study' }];
  }

  // Weeks 1-10: domain study cadence
  switch (dayName) {
    case 'Sat':
      return [
        { text: 'Saturday timed block: 50 mixed questions from every domain so far (90 min)', minutes: 90, type: 'quiz' },
        { text: 'Review every wrong answer, even the close ones', minutes: 30, type: 'review' },
      ];
    case 'Sun':
      return [{ text: 'Sunday review: re-read every note from this week, no new material (60 min)', minutes: 60, type: 'review' }];
    case 'Wed':
      return [
        { text: 'Read 30-40 OSG pages, note every acronym', minutes: 60, type: 'study' },
        { text: 'Wednesday quiz: 25 questions on the current domain, no look-ups (30 min)', minutes: 30, type: 'quiz' },
        { text: 'Add every missed item to flashcards', minutes: 10, type: 'review' },
      ];
    default:
      return [
        { text: 'Read 30-40 OSG pages, note every acronym (1.5 h)', minutes: 90, type: 'study' },
        { text: 'Flashcard review (Anki)', minutes: 15, type: 'review' },
      ];
  }
}

function buildDays() {
  const days = [];
  for (let d = 1; d <= 90; d++) {
    const weekIdx = Math.min(Math.ceil(d / 7), 13) - 1;
    const week = WEEKS[weekIdx];
    const dayName = DAY_NAMES[(d - 1) % 7];
    days.push({
      day: d,
      week: week.week,
      dayName,
      tasks: tasksFor(week, dayName),
    });
  }
  return days;
}

const PLAN = {
  title: '90-Day CISSP Challenge',
  totalHoursTarget: 135,
  questionTarget: 2000,
  checkpoints: [
    { name: 'Wednesday quiz', minutes: 30, detail: '25 questions on the current domain. No look-ups. Add misses to flashcards.' },
    { name: 'Saturday timed block', minutes: 90, detail: '50 mixed questions from every domain studied to date. Forces cross-domain pattern recognition.' },
    { name: 'Sunday review', minutes: 60, detail: 'Re-read every note from the week. No new material. Re-encodes short-term recall into long-term memory.' },
  ],
  materials: [
    'Official (ISC)² CISSP Study Guide (OSG, current edition) — primary text',
    'One quality question bank: Boson ExSim, Pocket Prep, or the OSG question bank app (2,000+ questions)',
    'Spaced-repetition flashcards: Anki or equivalent',
    'Week-12 refresher: Pete Zerger exam-cram playlist',
  ],
  weeks: WEEKS,
  days: buildDays(),
};

module.exports = PLAN;
