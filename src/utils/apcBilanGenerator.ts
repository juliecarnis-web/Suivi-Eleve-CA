import { ApcEntry, Result, Student } from '../types';

export type ApcBilanStyle = 'lsu' | 'parents' | 'synthese';

export interface ApcBilanOptions {
  style: ApcBilanStyle;
  includeDetails: boolean;
  variant?: number;
}

export interface StudentApcBilanSummary {
  student: Student;
  sessionCount: number;
  dates: string[];
  domains: string[];
  chapters: Array<{
    code: string;
    title: string;
    domain: string;
    count: number;
    competenceId: number | null;
    currentScore: number | null;
    isNowValidated: boolean;
  }>;
  text: string;
}

export interface ApcSessionGroup {
  sessionId: string;
  sessionDate: string;
  notes: string;
  entries: ApcEntry[];
  studentCount: number;
  distinctChapters: string[];
}

export function formatDateFr(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function joinFrenchList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} et ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

export function filterApcEntriesByDateRange(
  entries: ApcEntry[],
  startDate: string,
  endDate: string
): ApcEntry[] {
  return entries.filter(e => {
    if (startDate && e.session_date < startDate) return false;
    if (endDate && e.session_date > endDate) return false;
    return true;
  });
}

export function groupApcSessions(entries: ApcEntry[]): ApcSessionGroup[] {
  const map = new Map<string, ApcSessionGroup>();

  entries.forEach(entry => {
    let group = map.get(entry.session_id);
    if (!group) {
      group = {
        sessionId: entry.session_id,
        sessionDate: entry.session_date,
        notes: entry.notes || '',
        entries: [],
        studentCount: 0,
        distinctChapters: []
      };
      map.set(entry.session_id, group);
    }
    group.entries.push(entry);
    if (!group.notes && entry.notes) {
      group.notes = entry.notes;
    }
  });

  return Array.from(map.values())
    .map(g => ({
      ...g,
      studentCount: new Set(g.entries.map(e => e.student_id)).size,
      distinctChapters: Array.from(new Set(g.entries.map(e => e.chapter_code).filter(Boolean)))
    }))
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
}

export function generateStudentApcBilan(
  student: Student,
  periodEntries: ApcEntry[],
  results: Record<string, Record<number, Result>>,
  startDate: string,
  endDate: string,
  options: ApcBilanOptions
): StudentApcBilanSummary | null {
  const stEntries = periodEntries
    .filter(e => e.student_id === student.id)
    .sort((a, b) => a.session_date.localeCompare(b.session_date));

  if (stEntries.length === 0) return null;

  const uniqueDates = Array.from(new Set(stEntries.map(e => e.session_date))).sort();
  const uniqueSessionIds = Array.from(new Set(stEntries.map(e => e.session_id)));
  const sessionCount = uniqueSessionIds.length;

  const domainSet = new Set<string>();
  const chapterMap = new Map<
    string,
    {
      code: string;
      title: string;
      domain: string;
      count: number;
      competenceId: number | null;
      currentScore: number | null;
      isNowValidated: boolean;
    }
  >();

  stEntries.forEach(e => {
    if (e.domain) domainSet.add(e.domain);
    const key = e.chapter_code;
    const existing = chapterMap.get(key);
    const res = e.competence_id !== null ? results[student.id]?.[e.competence_id] : undefined;
    const currentScore =
      res && res.isStarted && res.score !== null && res.score !== undefined ? Number(res.score) : null;

    if (!existing) {
      chapterMap.set(key, {
        code: e.chapter_code,
        title: e.chapter_title || e.chapter_code,
        domain: e.domain || '',
        count: 1,
        competenceId: e.competence_id,
        currentScore,
        isNowValidated: currentScore !== null && currentScore >= 5
      });
    } else {
      existing.count += 1;
    }
  });

  const chapters = Array.from(chapterMap.values());
  const domains = Array.from(domainSet);
  const validatedChapters = chapters.filter(c => c.isNowValidated);
  const variant = Math.abs(options.variant ?? 0) % 3;
  const firstName = student.firstName;

  const periodStr =
    startDate && endDate
      ? `du ${formatDateFr(startDate)} au ${formatDateFr(endDate)}`
      : startDate
        ? `depuis le ${formatDateFr(startDate)}`
        : endDate
          ? `jusqu'au ${formatDateFr(endDate)}`
          : 'sur la période observée';

  const seanceLabel = `${sessionCount} séance${sessionCount > 1 ? 's' : ''}`;
  const datesDetail = options.includeDetails
    ? ` (${uniqueDates.map(formatDateFr).join(', ')})`
    : '';

  const chapterLabels = chapters.map(c =>
    options.includeDetails
      ? c.title && c.title !== c.code
        ? `${c.code} (${c.title})`
        : c.code
      : c.title || c.code
  );
  const topicsStr = joinFrenchList(chapterLabels.slice(0, 4));
  const extraTopics = chapterLabels.length > 4 ? ` et ${chapterLabels.length - 4} autre(s) notion(s)` : '';
  const domainsStr = domains.length > 0 ? joinFrenchList(domains.map(d => d.toLowerCase())) : 'les apprentissages fondamentaux';

  let text = '';

  if (options.style === 'lsu') {
    const introVariants = [
      `${firstName} a participé volontairement à ${seanceLabel} d'APC ${periodStr}${datesDetail}.`,
      `Sur inscription volontaire, ${firstName} a suivi ${seanceLabel} d'accompagnement en APC ${periodStr}${datesDetail}.`,
      `Entre ${periodStr.replace(/^du /, 'le ')}, ${firstName} a pris part à ${seanceLabel} d'APC${datesDetail}.`
    ];
    const workVariants = [
      `Les séances ont porté sur ${topicsStr}${extraTopics} (${domainsStr}).`,
      `Le travail en petit groupe a ciblé ${topicsStr}${extraTopics}.`,
      `L'accompagnement a permis de reprendre ${topicsStr}${extraTopics}.`
    ];

    const sentences = [introVariants[variant], workVariants[variant]];

    if (validatedChapters.length > 0) {
      const valStr = joinFrenchList(
        validatedChapters.map(c => (c.title && c.title !== c.code ? `${c.code} (${c.title})` : c.code))
      );
      sentences.push(
        options.includeDetails
          ? `Les compétences travaillées progressent positivement, avec validation atteinte (≥ 5) sur ${valStr}.`
          : `Cet étayage ciblé a porté ses fruits avec une validation désormais acquise sur ${validatedChapters.length} notion${validatedChapters.length > 1 ? 's' : ''}.`
      );
    } else {
      sentences.push(
        `Cet accompagnement ciblé soutient efficacement sa progression en autonomie et sa confiance.`
      );
    }

    text = sentences.join(' ');
  } else if (options.style === 'parents') {
    const introVariants = [
      `${firstName} s'est inscrit(e) avec sérieux à ${seanceLabel} d'APC ${periodStr}${datesDetail}.`,
      `Nous tenons à souligner l'engagement positif de ${firstName}, qui a suivi volontairement ${seanceLabel} d'APC ${periodStr}${datesDetail}.`,
      `${periodStr.charAt(0).toUpperCase() + periodStr.slice(1)}, ${firstName} a bénéficié de ${seanceLabel} en petit groupe d'APC${datesDetail}.`
    ];
    const workVariants = [
      `Ce temps calme nous a permis de retravailler ensemble ${topicsStr}${extraTopics}.`,
      `En petit effectif, nous avons consolidé ${topicsStr}${extraTopics}.`,
      `Ces ateliers ont aidé ${firstName} à reprendre sereinement ${topicsStr}${extraTopics}.`
    ];

    const sentences = [introVariants[variant], workVariants[variant]];

    if (validatedChapters.length > 0) {
      const valStr = joinFrenchList(
        validatedChapters.map(c => (c.title && c.title !== c.code ? `${c.code} (${c.title})` : c.code))
      );
      sentences.push(
        options.includeDetails
          ? `Bravo pour ses efforts : le seuil de maîtrise est déjà atteint sur ${valStr} !`
          : `Ces efforts réguliers portent déjà leurs fruits et permettent de valider durablement les notions travaillées.`
      );
    } else {
      sentences.push(
        `Cette démarche volontaire montre une belle envie de progresser qui va continuer à payer au fil de l'année.`
      );
    }

    text = sentences.join(' ');
  } else {
    // Synthèse structurée pour suivi enseignant / réunion
    const statusParts = chapters.map(c => {
      const scoreSuffix =
        options.includeDetails && c.currentScore !== null
          ? ` [actuel : ${c.currentScore}/5${c.isNowValidated ? ' ✓' : ''}]`
          : c.isNowValidated
            ? ' [validé ✓]'
            : '';
      const cleanTitle = (c.title || '').trim();
      const hasDistinctTitle = Boolean(cleanTitle && cleanTitle !== c.code);
      const label = hasDistinctTitle
        ? options.includeDetails
          ? `${c.code} — ${cleanTitle}`
          : `${cleanTitle} (${c.code})`
        : c.code;
      return `${label}${c.count > 1 ? ` (×${c.count})` : ''}${scoreSuffix}`;
    });

    text = `${firstName} ${student.lastName.toUpperCase()} (${student.grade}) — ${seanceLabel} ${periodStr}${datesDetail}\nNotions : ${statusParts.join(' ; ')}.`;
  }

  return {
    student,
    sessionCount,
    dates: uniqueDates,
    domains,
    chapters,
    text
  };
}

export function generateClassApcBilanText(
  periodEntries: ApcEntry[],
  students: Student[],
  results: Record<string, Record<number, Result>>,
  startDate: string,
  endDate: string,
  options: ApcBilanOptions
): string {
  if (periodEntries.length === 0) return '';

  const sessions = groupApcSessions(periodEntries);
  const studentMap = new Map(students.map(s => [s.id, s]));
  const distinctStudentIds = Array.from(new Set(periodEntries.map(e => e.student_id)));

  const domainCounts = new Map<string, number>();
  const chapterCounts = new Map<string, { code: string; title: string; count: number }>();
  periodEntries.forEach(e => {
    if (e.domain) domainCounts.set(e.domain, (domainCounts.get(e.domain) || 0) + 1);
    if (e.chapter_code) {
      const existing = chapterCounts.get(e.chapter_code);
      const cleanTitle = (e.chapter_title || '').trim();
      if (!existing) {
        chapterCounts.set(e.chapter_code, {
          code: e.chapter_code,
          title: cleanTitle,
          count: 1
        });
      } else {
        existing.count += 1;
        if (!existing.title && cleanTitle) existing.title = cleanTitle;
      }
    }
  });

  const topDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([d]) => d);

  const workedChapters = Array.from(chapterCounts.values())
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, 'fr'))
    .map(ch => {
      const hasDistinctTitle = Boolean(ch.title && ch.title !== ch.code);
      const label = hasDistinctTitle
        ? options.includeDetails
          ? `${ch.code} — ${ch.title}`
          : `${ch.title} (${ch.code})`
        : ch.code;
      return `${label}${ch.count > 1 ? ` (×${ch.count})` : ''}`;
    });

  const periodStr =
    startDate && endDate
      ? `du ${formatDateFr(startDate)} au ${formatDateFr(endDate)}`
      : startDate
        ? `depuis le ${formatDateFr(startDate)}`
        : endDate
          ? `jusqu'au ${formatDateFr(endDate)}`
          : 'sur la période';

  const headerLines = [
    `Bilan APC ${periodStr}`,
    `• ${sessions.length} séance${sessions.length > 1 ? 's' : ''} réalisée${sessions.length > 1 ? 's' : ''} • ${distinctStudentIds.length} élève${distinctStudentIds.length > 1 ? 's' : ''} accompagné${distinctStudentIds.length > 1 ? 's' : ''}`,
    topDomains.length > 0 ? `• Domaines principaux : ${topDomains.join(', ')}` : '',
    workedChapters.length > 0 ? `• Chapitres travaillés :\n  - ${workedChapters.join('\n  - ')}` : ''
  ].filter(Boolean);

  const studentLines = distinctStudentIds
    .map(id => studentMap.get(id))
    .filter((s): s is Student => Boolean(s))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr'))
    .map((st, idx) => {
      const summary = generateStudentApcBilan(st, periodEntries, results, startDate, endDate, {
        ...options,
        variant: ((options.variant ?? 0) + idx) % 3
      });
      if (!summary) return '';
      if (options.style === 'synthese') return `• ${summary.text}`;
      return `${st.firstName} ${st.lastName.toUpperCase()} (${st.grade}) :\n${summary.text}`;
    })
    .filter(Boolean);

  return `${headerLines.join('\n')}\n\n${studentLines.join('\n\n')}`;
}
