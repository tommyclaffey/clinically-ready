// Builds the demo practice's Resources library: 9 real multi-page documents for Cedar Grove Counseling
// (6 PDFs printed by headless Chrome, 3 Word files written here), their first-page previews, and a
// manifest the demo reads. Output: server/demo-library/. Re-run after changing any text below.
//   node scripts/make-demo-library.mjs
// Needs Google Chrome (macOS path below). The demo shares these files; nothing is copied per visitor.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyseFile } from '../server/previews.mjs';
import { makeZip } from '../server/seed-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'server', 'demo-library');
const PRACTICE = 'Cedar Grove Counseling';
const DIRECTOR = 'Dr. Rachel Moore, Clinical director';
const BRAND = '#2F6B5E';
const BRAND_DEEP = '#1E4A40';

// ---------------------------------------------------------------- content
// A fictional practice's own documents. Plain, generic onboarding: nothing here is legal or clinical advice.

const topic = (h, p, items = [], note = '') => ({ h, p, items, note });

const HANDBOOK = [
  topic('A welcome from the director', 'We are glad you are here. Cedar Grove is a small group practice, and every clinician shapes how it feels to walk through our door. This handbook covers how we work day to day. Your supervisor will walk you through anything that is unclear.', ['Read one chapter a day in your first two weeks.', 'Bring questions to supervision.', 'Nothing here replaces your licensing board’s rules.'], 'Dr. Rachel Moore, Clinical director'),
  topic('Our mission', 'We help people through hard seasons with care that is skilled, warm and on time. We measure ourselves by whether clients feel heard and whether they get better.', ['Clients first, always.', 'Do the paperwork so the care can happen.', 'Ask for help early.']),
  topic('Who we serve', 'Our clients are adults, couples and teens across the county. Many are seeing a counselor for the first time. About a third of sessions are by telehealth.', ['Adults 18 and over', 'Couples', 'Teens 13 to 17 with a guardian’s consent']),
  topic('Your first week', 'Week one is for set-up and people, not a full caseload. You will meet your supervisor, sign your agreements and get every account working.', ['Sign the confidentiality agreement', 'Set up SimplePractice, Zoom and Slack', 'Shadow two intakes']),
  topic('Your supervisor', 'Your supervisor is your first call for anything clinical. You will meet weekly, and you can always ask for an extra check-in when a case worries you.', ['Weekly one-hour supervision', 'Same-day consult for safety concerns', 'Notes on every supervision session']),
  topic('Office hours and access', 'The office is open 8 am to 8 pm on weekdays and 9 am to 2 pm on Saturdays. Evening sessions end by 8 pm so the building can be locked on time.', ['Front desk staffed 9 am to 5 pm', 'Last session starts at 7 pm', 'Saturday sessions by arrangement']),
  topic('Keys, alarms and parking', 'You will get a key fob on day one. The alarm code is personal: never share it. Staff park in the rear lot so the front stays free for clients.', ['Report a lost fob the same day', 'Arm the alarm if you leave last', 'Rear lot for staff']),
  topic('Scheduling in SimplePractice', 'Every appointment lives in SimplePractice. Clients book through the portal or the front desk; you manage your own availability.', ['Keep your availability current', 'Block time for notes', 'Never book outside the system']),
  topic('Session length and timing', 'Standard sessions are 53 minutes. Start on time and end on time, so the next client is not kept waiting.', ['Intake: 60 minutes', 'Standard: 53 minutes', 'Couples: 60 minutes']),
  topic('Cancellations and no-shows', 'Clients cancel with 24 hours’ notice. A late cancellation or no-show is charged the fee in our policy, unless there is an emergency.', ['Mark it in SimplePractice the same day', 'Reach out after two no-shows', 'Talk to your supervisor before discharge']),
  topic('The intake process', 'Every new client completes the intake packet before the first session. You review it before you meet them and note any safety flags.', ['Intake packet complete', 'Consent signed', 'Safety screen reviewed']),
  topic('Informed consent', 'Consent is a conversation, not a form. Explain how counseling works, the limits of confidentiality and how to reach us.', ['Review consent in session one', 'Revisit it when anything changes', 'Document that you did']),
  topic('Confidentiality basics', 'What a client shares stays in the room and in the record. Talk about cases only with your supervisor or in case review, never in shared spaces.', ['No names in Slack or email', 'Lock your screen', 'Close the door']),
  topic('Limits of confidentiality', 'There are times we must share information: risk of serious harm, suspected abuse of a child or vulnerable adult, and a court order. Clients hear this at intake.', ['Harm to self or others', 'Suspected abuse or neglect', 'Court orders']),
  topic('Mandated reporting', 'If you suspect abuse or neglect, you report it. Tell your supervisor the same day and document the report.', ['Report within the required time', 'Tell your supervisor', 'Document what you reported and when']),
  topic('Documentation timelines', 'Notes are finished within 24 hours of the session. Treatment plans are written by the third session and reviewed every 90 days.', ['Progress note: 24 hours', 'Treatment plan: by session three', 'Plan review: every 90 days']),
  topic('Progress notes', 'We use the SOAP format. Keep notes short, factual and clinical. Write as if the client will read them, because they may.', ['Subjective', 'Objective', 'Assessment and plan']),
  topic('Treatment plans', 'A plan names the problem, the goals and how you will measure progress. Write it with the client, in their words where you can.', ['Two to three goals', 'Measurable objectives', 'Review dates']),
  topic('Discharge summaries', 'When care ends, write a short summary: why the client came, what changed and any referrals. Finish it within a week.', ['Reason for discharge', 'Progress on goals', 'Referrals given']),
  topic('Telehealth sessions', 'Telehealth runs on the practice Zoom account only. Confirm the client’s location at the start of every session in case of an emergency.', ['Private room, headphones on', 'Confirm location', 'Have a backup phone number']),
  topic('Crisis response', 'If a client is at risk, stay with them, follow the crisis protocol and call your supervisor. Never leave a client at risk alone.', ['Follow the crisis and safety protocol', 'Call your supervisor', 'Document everything']),
  topic('Safety planning', 'Every client with a risk flag gets a written safety plan, made together, and a copy to keep.', ['Warning signs', 'Coping steps', 'People and numbers to call']),
  topic('Consultation and case review', 'Case review meets every other Thursday. Bring one case you are unsure about; the group is there to help, not judge.', ['Every other Thursday, 12 pm', 'De-identify all cases', 'Notes kept by the facilitator']),
  topic('Supervision hours', 'Associates and interns log supervision hours in the supervision log every week. Your supervisor signs it monthly.', ['Log weekly', 'Signed monthly', 'Keep a copy for your board']),
  topic('Licensure tracking', 'Keep your license, insurance and CE certificates current. The office reminds you 60 days before anything expires.', ['License number on file', 'Malpractice insurance', 'CE certificates']),
  topic('Continuing education', 'Each clinician gets a yearly CE budget. Ask your supervisor before booking, and share what you learn at case review.', ['Yearly CE budget', 'Pre-approval', 'Share back with the team']),
  topic('Caseload expectations', 'Caseloads build over your first three months. Associates aim for 20 to 25 sessions a week once settled.', ['Month 1: up to 10 a week', 'Month 2: up to 18', 'Month 3: full caseload']),
  topic('Billing and superbills', 'The office handles billing. You make sure every session is coded and signed the same day so claims go out on time.', ['Code every session', 'Sign notes promptly', 'Flag any billing questions']),
  topic('Insurance and authorizations', 'Some plans need an authorization before session one or after a set number of sessions. The front desk tracks this; tell them when a plan changes.', ['Check authorization status', 'Update insurance changes', 'Never promise coverage']),
  topic('Fees and sliding scale', 'Our fees are on the website. A limited number of sliding-scale spots are available; the director approves them.', ['Published fees', 'Sliding scale by approval', 'Review yearly']),
  topic('Client communication', 'Use the SimplePractice portal for messages. Keep messages short and about logistics; clinical work happens in session.', ['Portal messages only', 'Reply within one business day', 'No clinical advice by message']),
  topic('Email and texting', 'Never send client details by personal email or text. Appointment reminders go out automatically from SimplePractice.', ['No personal phones for clients', 'No client names in email', 'Automatic reminders only']),
  topic('Social media', 'We do not connect with current or former clients on social media, and we never post about a client, even without a name.', ['No friending clients', 'No posts about sessions', 'See the social media policy']),
  topic('Dual relationships', 'Avoid relationships with clients outside counseling. In a small town it happens; talk to your supervisor when it does.', ['No business with clients', 'Tell your supervisor', 'Document the plan']),
  topic('Gifts from clients', 'Small, one-time gifts may be accepted with care. Anything over a small value is politely declined.', ['Small and occasional only', 'Talk it through', 'Note it in the chart']),
  topic('Self-care and burnout', 'This work is heavy. Use your time off, keep your lunch break and tell your supervisor when you are running low.', ['Protected lunch break', 'Use your time off', 'Ask for help early']),
  topic('Time off requests', 'Request time off at least four weeks ahead in the shared calendar. Arrange coverage for any clients at risk.', ['Four weeks’ notice', 'Coverage plan', 'Out-of-office message on']),
  topic('Sick days', 'If you are sick, stay home. Tell the front desk by 7 am so clients can be moved or seen by telehealth.', ['Tell the front desk by 7 am', 'Offer telehealth if well enough', 'Rest']),
  topic('Professional conduct', 'Be on time, be kind, and keep your notes current. Treat colleagues with the same respect you give clients.', ['On time', 'Respectful', 'Current notes']),
  topic('Leaving the practice', 'Give 60 days’ notice so every client has a good transition. Finish all notes and hand over open cases in writing.', ['60 days’ notice', 'Written handover', 'All notes finished']),
];

const DOC_GUIDE = [
  topic('Why notes matter', 'Good notes protect the client, the clinician and the practice. They show what happened, why, and what comes next.', ['Clear', 'Timely', 'Clinical']),
  topic('Our standard: SOAP', 'Every progress note follows SOAP: Subjective, Objective, Assessment, Plan. Keep each part short.', ['S: what the client reports', 'O: what you observe', 'A: your clinical view', 'P: next steps']),
  topic('Writing the Subjective', 'Use the client’s own words where they matter. Summarize the rest.', ['Quote sparingly', 'Note changes since last session', 'Include stressors']),
  topic('Writing the Objective', 'Record what you saw and measured: affect, appearance, scores on any measures.', ['Mental status', 'Measures (PHQ-9, GAD-7)', 'Behavior in session']),
  topic('Writing the Assessment', 'Tie what you heard and saw to the treatment plan. Is the client improving, stable or worse?', ['Progress on goals', 'Risk level', 'Diagnosis updates']),
  topic('Writing the Plan', 'Name the next step: interventions, homework, referrals and the next appointment.', ['Next session date', 'Homework', 'Referrals']),
  topic('Timelines', 'Notes are due within 24 hours. Late notes delay billing and weaken the record.', ['24 hours for progress notes', 'Same day for crisis notes', '7 days for discharge']),
  topic('Treatment plans', 'Write the plan by the third session, with the client. Review it every 90 days.', ['Problem', 'Goals', 'Objectives', 'Review date']),
  topic('Risk documentation', 'Any risk screen, safety plan or consultation is written up the same day, in full.', ['Screen used', 'Plan made', 'Who you consulted']),
  topic('Telehealth notes', 'Add the client’s location, the platform and that consent for telehealth is on file.', ['Location', 'Platform', 'Consent on file']),
  topic('Couples and family notes', 'Write one note per session, naming who attended. Keep individual disclosures out of shared notes.', ['Who attended', 'Shared goals', 'No secrets in the shared record']),
  topic('Late entries and corrections', 'Never delete. Add a dated addendum that explains the correction.', ['Addendum, not edit', 'Date and sign', 'Explain why']),
  topic('Language to avoid', 'Avoid labels, slang and judgment. Describe behavior instead.', ['“Client was tearful” not “client was dramatic”', 'No abbreviations clients cannot read', 'No opinions about character']),
  topic('Records requests', 'Clients can ask for their records. Send every request to the front desk; never email records yourself.', ['Front desk handles requests', 'Verify identity', 'Log what was sent']),
  topic('Audits', 'The director reviews a sample of charts each quarter. You will get feedback, not a grade.', ['Quarterly sample', 'Written feedback', 'Fix within two weeks']),
  topic('Quick checklist', 'Before you sign a note, check these five things.', ['Date and length', 'All four SOAP parts', 'Risk addressed', 'Plan and next date', 'Signed']),
  topic('Sample note', 'S: Client reports sleeping better, still anxious before work. O: Calm, engaged, GAD-7 = 9 (was 13). A: Improving on goal 1. P: Continue exposure practice; next session in one week.', []),
];

const CRISIS = [
  topic('When this protocol applies', 'Use it whenever a client may be at risk of harming themselves or someone else, in person or on telehealth.', ['Thoughts of suicide', 'Threats to others', 'Acute intoxication or psychosis']),
  topic('Step 1: Stay with the client', 'Do not leave a client at risk alone. On telehealth, keep the call open and confirm their location.', ['Stay calm and present', 'Confirm location', 'Remove means if safe to do so']),
  topic('Step 2: Assess risk', 'Use the risk screen in SimplePractice. Ask directly about thoughts, plan, means and intent.', ['Thoughts', 'Plan and means', 'Intent and timeline']),
  topic('Step 3: Call your supervisor', 'Call or message your supervisor right away. If they do not answer, call the director.', ['Supervisor first', 'Then the director', 'Then the on-call clinician']),
  topic('Step 4: Make a safety plan or call for help', 'For lower risk, make a written safety plan together. For imminent risk, call 988 or 911.', ['Safety plan', '988 Suicide and Crisis Lifeline', '911 for imminent danger']),
  topic('Step 5: Document the same day', 'Write a full crisis note before you leave: what happened, the screen, who you called and the plan.', ['Crisis note', 'Screen results', 'Follow-up booked']),
  topic('Follow-up', 'Contact the client within 24 hours. Bring the case to your next supervision.', ['Check-in within 24 hours', 'Review in supervision', 'Update the treatment plan']),
];

const TELEHEALTH = [
  topic('Where sessions happen', 'Telehealth sessions run on the practice Zoom account, from a private, quiet room.', ['Practice Zoom only', 'Private room', 'Headphones on']),
  topic('Before the session', 'Make sure telehealth consent is on file and the client knows how to join.', ['Consent on file', 'Link sent from SimplePractice', 'Test your camera and sound']),
  topic('At the start of every session', 'Confirm the client’s name, location and a phone number to reach them if the call drops.', ['Name and location', 'Backup phone number', 'Who else is in the room']),
  topic('If something goes wrong', 'If the call drops, call the backup number. If a client is at risk, follow the crisis and safety protocol.', ['Call the backup number', 'Crisis protocol for risk', 'Note it in the record']),
];

const SOCIAL = [
  topic('The short version', 'We do not connect with current or former clients on social media, and we never post about a client, even without a name.', ['No friend requests', 'No posts about sessions', 'No reviews replies with client details']),
  topic('Your own accounts', 'Keep personal accounts private. You may list your work at Cedar Grove; do not offer advice to the public.', ['Private settings', 'No clinical advice', 'Speak for yourself only']),
  topic('Practice accounts', 'Only the director posts for Cedar Grove. Send ideas to the office.', ['Director approves posts', 'No client stories without written consent', 'No photos of clients']),
];

const BILLING = [
  topic('Our fees', 'Fees are published on our website and reviewed every January.', ['Intake: $180', 'Standard session: $150', 'Couples session: $170']),
  topic('Insurance', 'We are in network with several plans. The front desk checks benefits before the first session.', ['Benefits checked at intake', 'Copays due at the session', 'Clients get a receipt']),
  topic('Sliding scale', 'A limited number of reduced-fee spots are available. The director approves them and reviews them every six months.', ['Ask the director', 'Reviewed every six months', 'Never offered by the clinician alone']),
  topic('Late cancellations and no-shows', 'With less than 24 hours’ notice, the session fee is charged unless there is an emergency.', ['24 hours’ notice', 'Fee charged after that', 'Waived for emergencies']),
  topic('Payment and receipts', 'Cards are kept on file in SimplePractice. Superbills are available on request.', ['Card on file', 'Monthly statements', 'Superbills on request']),
];

// ---------------------------------------------------------------- PDF (HTML printed by Chrome)

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CSS = `
@page { size: Letter; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font: 11pt/1.55 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2A3336; }
.page { width: 8.5in; height: 11in; padding: 0.9in 0.95in 0.8in; position: relative; page-break-after: always; overflow: hidden; }
.page:last-child { page-break-after: auto; }
h1 { font: 600 30pt/1.15 Georgia, serif; color: #1B2427; margin-bottom: 14pt; }
h2 { font: 600 17pt/1.25 Georgia, serif; color: #1B2427; margin: 0 0 10pt; }
h3 { font: 700 10pt/1.3 'Helvetica Neue', sans-serif; letter-spacing: .12em; text-transform: uppercase; color: ${BRAND}; margin: 18pt 0 6pt; }
p { margin: 0 0 10pt; }
ul { margin: 0 0 10pt 16pt; } li { margin: 0 0 4pt; }
.kicker { font: 700 9pt/1 'Helvetica Neue', sans-serif; letter-spacing: .16em; text-transform: uppercase; color: ${BRAND}; margin-bottom: 14pt; }
.note { margin-top: 14pt; padding: 10pt 12pt; background: #EEF4F1; border-left: 3pt solid ${BRAND}; font-size: 10pt; }
.foot { position: absolute; left: 0.95in; right: 0.95in; bottom: 0.45in; display: flex; justify-content: space-between; font-size: 8pt; color: #7A8386; border-top: 0.5pt solid #D9D4CD; padding-top: 6pt; }
.toc li { list-style: none; display: flex; justify-content: space-between; border-bottom: 0.5pt dotted #C9C3BA; padding: 3pt 0; margin: 0; font-size: 10pt; }
.toc { margin: 0; columns: 2; column-gap: 24pt; } .toc li { break-inside: avoid; font-size: 9pt; }
.cover { background: ${BRAND_DEEP}; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.cover .mark { width: 1.6in; height: 1.6in; border-radius: 50%; background: #CFE3DC; color: ${BRAND_DEEP}; font: 600 64pt/1.6in Georgia, serif; margin-bottom: 0.6in; }
.cover h1 { color: #fff; font-size: 40pt; margin-bottom: 10pt; }
.cover .sub { font-size: 13pt; color: #DCE9E4; letter-spacing: .04em; }
.cover .rule { width: 1.9in; height: 3pt; background: #CFE3DC; margin: 0.9in auto 12pt; border-radius: 2pt; }
.cover .who { font-size: 10pt; color: #DCE9E4; letter-spacing: .14em; text-transform: uppercase; }
.steps { list-style: none; margin: 0; }
.steps li { display: flex; gap: 12pt; align-items: flex-start; margin: 0 0 14pt; }
.steps .n { flex: none; width: 22pt; height: 22pt; border-radius: 50%; background: ${BRAND}; color: #fff; font: 700 10pt/22pt 'Helvetica Neue', sans-serif; text-align: center; }
.steps b { display: block; color: #1B2427; }
.banner { height: 0.5in; margin: -0.9in -0.95in 0.5in; background: #E3EFEA; border-bottom: 3pt solid ${BRAND}; }
table.fees { width: 100%; border-collapse: collapse; margin: 6pt 0 14pt; font-size: 10pt; }
table.fees td, table.fees th { border-bottom: 0.5pt solid #D9D4CD; padding: 6pt 4pt; text-align: left; }
table.fees td:last-child, table.fees th:last-child { text-align: right; }
`;

const foot = (title, n, total) => `<div class="foot"><span>${esc(PRACTICE)} · ${esc(title)}</span><span>${n} of ${total}</span></div>`;
const topicHtml = (t) => `<h2>${esc(t.h)}</h2><p>${esc(t.p)}</p>${t.items.length ? `<ul>${t.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}${t.note ? `<div class="note">${esc(t.note)}</div>` : ''}`;

function pdfDoc(title, pages) {
  const total = pages.length;
  const body = pages.map((html, i) => `<section class="page${html.cover ? ' cover' : ''}">${html.cover ? html.html : html}${html.cover ? '' : foot(title, i + 1, total)}</section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

const intro = (kicker, title, lead, headings) =>
  `<div class="kicker">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(lead)}</p>` +
  headings.map(([h, p]) => `<h3>${esc(h)}</h3><p>${esc(p)}</p>`).join('');

const PDFS = [
  {
    slug: 'clinician-handbook', title: 'Clinician handbook', category: 'Resource', daysAgo: 25,
    pages: () => [
      { cover: true, html: `<div class="mark">C</div><h1>Clinician handbook</h1><div class="sub">${esc(PRACTICE)}</div><div class="rule"></div><div class="who">Edition 2026</div>` },
      `<div class="kicker">Contents</div><h1>In this handbook</h1><ul class="toc">${HANDBOOK.map((t, i) => `<li><span>${i + 1}. ${esc(t.h)}</span><span>${i + 3}</span></li>`).join('')}</ul>`,
      ...HANDBOOK.map((t, i) => `<div class="kicker">Chapter ${i + 1}</div>${topicHtml(t)}`),
    ],
  },
  {
    slug: 'documentation-guide', title: 'Documentation guide', category: 'Resource', daysAgo: 55,
    pages: () => [
      intro('Documentation', 'Documentation guide', 'How we write progress notes, treatment plans and discharge summaries at Cedar Grove, with timelines and a sample note.', [
        ['The standard', 'Every progress note follows SOAP and is finished within 24 hours of the session.'],
        ['Treatment plans', 'Written with the client by the third session and reviewed every 90 days.'],
        ['Risk', 'Any risk screen, safety plan or consultation is written up the same day.'],
      ]),
      ...DOC_GUIDE.map(topicHtml),
    ],
  },
  {
    slug: 'crisis-and-safety-protocol', title: 'Crisis & safety protocol', category: 'Policy', daysAgo: 28,
    pages: () => [
      `<div class="kicker">Policy</div><h1>Crisis &amp; safety protocol</h1><p>What to do, in order, when a client may be at risk.</p><ol class="steps">${CRISIS.slice(1, 6).map((t, i) => `<li><span class="n">${i + 1}</span><span><b>${esc(t.h.replace(/^Step \d: /, ''))}</b>${esc(t.p)}</span></li>`).join('')}</ol>`,
      ...CRISIS.map(topicHtml),
    ],
  },
  {
    slug: 'telehealth-policy', title: 'Telehealth policy', category: 'Policy', daysAgo: 60,
    pages: () => [
      `<div class="banner"></div><div class="kicker">Policy</div><h1>Telehealth policy</h1><p>How we hold safe, private sessions by video. This policy applies to every clinician and every telehealth session.</p><h3>Scope</h3><p>All sessions held by video or phone, from any location.</p><h3>Owner</h3><p>${esc(DIRECTOR)}. Reviewed every year.</p>`,
      ...TELEHEALTH.map(topicHtml),
    ],
  },
  {
    slug: 'social-media-policy', title: 'Social media policy', category: 'Policy', daysAgo: 90,
    pages: () => [
      `<div class="kicker">Policy</div><h1>Social media policy</h1><p>Protecting client privacy online.</p><ul>${['We never connect with current or former clients.', 'We never post about a client, even without a name.', 'We keep personal accounts private.', 'Only the director posts for the practice.', 'Questions go to your supervisor.'].map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`,
      ...SOCIAL.map(topicHtml),
    ],
  },
  {
    slug: 'billing-and-fees-policy', title: 'Billing and fees policy', category: 'Policy', daysAgo: 150,
    pages: () => [
      `<div class="kicker">Policy</div><h1>Billing and fees policy</h1><p>Our fees, insurance, the sliding scale and how late cancellations are handled.</p><table class="fees"><tr><th>Service</th><th>Fee</th></tr>${[['Intake assessment (60 min)', '$180'], ['Individual session (53 min)', '$150'], ['Couples session (60 min)', '$170'], ['Late cancellation or no-show', '$150'], ['Letter or report', '$60']].map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`,
      ...BILLING.map(topicHtml),
    ],
  },
];

// ---------------------------------------------------------------- DOCX

const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const run = (t, { b = false, color = '', size = 0 } = {}) =>
  `<w:r><w:rPr>${b ? '<w:b/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
const para = (text, style = '', opts = {}) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${text ? run(text, opts) : ''}</w:p>`;
const bullet = (text) => `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(text)}</w:p>`;
const field = (label) => para(label, '', { b: true, size: 18 }) + `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:color="D9D4CD"/><w:left w:val="single" w:sz="4" w:color="D9D4CD"/><w:bottom w:val="single" w:sz="4" w:color="D9D4CD"/><w:right w:val="single" w:sz="4" w:color="D9D4CD"/></w:pBdr><w:spacing w:after="160"/></w:pPr>${run(' ')}</w:p>`;
const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const table = (rows) =>
  `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:color="D9D4CD"/>`).join('')}</w:tblBorders></w:tblPr>` +
  rows.map((r, i) => `<w:tr>${r.map((c) => `<w:tc><w:tcPr>${i === 0 ? '<w:shd w:val="clear" w:fill="E3EFEA"/>' : ''}</w:tcPr><w:p>${run(c || ' ', { b: i === 0, size: 18 })}</w:p></w:tc>`).join('')}</w:tr>`).join('') +
  '</w:tbl><w:p/>';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:color w:val="2A3336"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="1B2427"/><w:sz w:val="48"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:b/><w:color w:val="1B2427"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="${BRAND.slice(1)}"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:style>
</w:styles>`;
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

function docx(title, bodyXml, pages) {
  const x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const rel = (id, type, target) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/${type}" Target="${target}"/>`;
  const created = '2026-09-01T09:00:00Z';
  return makeZip([
    { name: '[Content_Types].xml', data: `${x}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `${x}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rId1', 'officeDocument/2006/relationships/officeDocument', 'word/document.xml')}${rel('rId2', 'officeDocument/2006/relationships/extended-properties', 'docProps/app.xml')}${rel('rId3', 'package/2006/relationships/metadata/core-properties', 'docProps/core.xml')}</Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `${x}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel('rId1', 'officeDocument/2006/relationships/styles', 'styles.xml')}${rel('rId2', 'officeDocument/2006/relationships/numbering', 'numbering.xml')}</Relationships>` },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: NUMBERING },
    { name: 'word/document.xml', data: `${x}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>` },
    { name: 'docProps/app.xml', data: `${x}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application><Pages>${pages}</Pages><Company>${xmlEsc(PRACTICE)}</Company></Properties>` },
    { name: 'docProps/core.xml', data: `${x}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(title)}</dc:title><dc:creator>${xmlEsc(PRACTICE)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created></cp:coreProperties>` },
  ]);
}

const INTAKE_PAGES = [
  ['About you', ['Full name', 'Date of birth', 'Pronouns', 'Address', 'Phone', 'Email']],
  ['Emergency contact', ['Name', 'Relationship', 'Phone', 'Can we leave a message? (yes / no)']],
  ['What brings you here', ['In your own words, what would you like help with?', 'How long has this been going on?', 'What have you tried so far?', 'What would be different if counseling helps?']],
  ['Health and history', ['Current medications', 'Primary care doctor', 'Past counseling (when, with whom)', 'Any hospital stays for mental health?', 'Alcohol or drug use']],
  ['Safety', ['In the last month, have you had thoughts of harming yourself?', 'Have you ever attempted to harm yourself?', 'Do you feel safe at home?', 'Is there anything else we should know to keep you safe?']],
  ['Consent and signatures', ['I have read the informed consent and privacy notice.', 'I understand the cancellation policy (24 hours’ notice).', 'Signature', 'Date']],
];
const intakeXml = () =>
  INTAKE_PAGES.map(([h, fields], i) =>
    (i === 0 ? para('Intake packet', 'Title') + para(`${PRACTICE} · New client forms. Please complete every page before your first session.`) : '') +
    para(h, 'Heading1') + fields.map(field).join('') + (i < INTAKE_PAGES.length - 1 ? pageBreak : ''),
  ).join('');

const SOAP = [
  ['S', 'Subjective', 'What the client reports: mood, stressors, changes since last session, in their words where it matters.'],
  ['O', 'Objective', 'What you observe: affect, appearance, engagement, scores on any measures (PHQ-9, GAD-7).'],
  ['A', 'Assessment', 'Your clinical view: progress on treatment plan goals, risk level, any change in diagnosis.'],
  ['P', 'Plan', 'Next steps: interventions, homework, referrals and the date of the next session.'],
];
const sessionXml = () =>
  para('Session note template', 'Title') +
  table([['Client', 'Date', 'Length'], [' ', ' ', '53 min']]) +
  SOAP.map(([l, h, help]) => para(`${l} · ${h}`, 'Heading2') + para(help) + field('Notes')).join('') +
  pageBreak +
  para('Risk and sign-off', 'Heading1') +
  bullet('Risk screen completed (yes / no)') + bullet('Safety plan reviewed or updated') + bullet('Consulted with supervisor (name, time)') +
  field('Clinician signature') + field('Date signed');

const SUP_ROWS = [['Date', 'Format', 'Hours', 'Topics', 'Supervisor']];
const supRows = (n) => Array.from({ length: n }, (_, i) => [`Week ${i + 1}`, i % 2 ? 'Group' : 'Individual', '1.0', '', 'R. Moore']);
const supervisionXml = () =>
  para('Supervision log', 'Title') +
  para(`${PRACTICE} · Log every supervision hour. Your supervisor signs this log each month.`) +
  table([...SUP_ROWS, ...supRows(12)]) +
  pageBreak + para('Months 4 to 6', 'Heading1') + table([...SUP_ROWS, ...supRows(12).map((r, i) => [`Week ${i + 13}`, ...r.slice(1)])]) +
  pageBreak + para('Monthly sign-off', 'Heading1') +
  table([['Month', 'Total hours', 'Supervisor signature', 'Date'], ['Month 1', '', '', ''], ['Month 2', '', '', ''], ['Month 3', '', '', ''], ['Month 4', '', '', ''], ['Month 5', '', '', ''], ['Month 6', '', '', '']]);

const DOCXS = [
  { slug: 'intake-packet', title: 'Intake packet', category: 'Resource', daysAgo: 32, pages: 6, xml: intakeXml },
  { slug: 'session-note-template', title: 'Session note template', category: 'Resource', daysAgo: 85, pages: 2, xml: sessionXml },
  { slug: 'supervision-log', title: 'Supervision log', category: 'Resource', daysAgo: 115, pages: 3, xml: supervisionXml },
];

// ---------------------------------------------------------------- Chrome

async function chrome() {
  const port = 9600 + Math.floor(Math.random() * 200);
  const proc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/cr-lib-${process.pid}`, 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let ws;
  for (let i = 0; i < 80 && !ws; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch {}
    await sleep(150);
  }
  if (ws.readyState !== 1) await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  return {
    async pdf(html) {
      const file = `/tmp/cr-lib-${process.pid}.html`;
      fs.writeFileSync(file, html);
      await send('Page.navigate', { url: `file://${file}` });
      await sleep(700);
      const r = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
      return Buffer.from(r.result.data, 'base64');
    },
    close: () => { ws.close(); proc.kill(); },
  };
}

// ---------------------------------------------------------------- build

fs.mkdirSync(OUT, { recursive: true });
const manifest = [];
const browser = await chrome();
const add = async (f, ext, bytes) => {
  const file = `${f.slug}.${ext}`;
  fs.writeFileSync(path.join(OUT, file), bytes);
  const { pages, png } = await analyseFile(ext, bytes);
  if (png) fs.writeFileSync(path.join(OUT, `${f.slug}.png`), png);
  manifest.push({ title: f.title, category: f.category, file, preview: png ? `${f.slug}.png` : null, pages, sizeBytes: bytes.length, daysAgo: f.daysAgo });
  console.log(`${file.padEnd(34)} ${String(pages).padStart(3)} pages  ${(bytes.length / 1024).toFixed(0).padStart(5)} KB`);
};
// Order on the page: the design's grid (resources first, then policies).
const ORDER = ['clinician-handbook', 'documentation-guide', 'intake-packet', 'session-note-template', 'supervision-log', 'crisis-and-safety-protocol', 'telehealth-policy', 'social-media-policy', 'billing-and-fees-policy'];
for (const slug of ORDER) {
  const p = PDFS.find((d) => d.slug === slug);
  if (p) await add(p, 'pdf', await browser.pdf(pdfDoc(p.title, p.pages())));
  const d = DOCXS.find((x) => x.slug === slug);
  if (d) await add(d, 'docx', docx(d.title, d.xml(), d.pages));
}
browser.close();
fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifest.length} files to ${path.relative(ROOT, OUT)}/`);
