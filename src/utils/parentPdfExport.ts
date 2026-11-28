import { jsPDF } from 'jspdf';
import { Student } from '../types';
import { ChapterExpertEntry } from './expertHelpers';

export interface ParentPdfDomainSummary {
  name: string;
  studentRawScore: number;
  cohortRawScore: number;
  studentPoints: number;
  cohortPoints: number;
}

export interface ParentPdfPriorityCard {
  id: string | number;
  code: string;
  title: string;
  domain: string;
  subDomain: string;
  score: number | null;
  pct: number | null;
  isValidated: boolean;
}

export interface ParentPdfFluenceEntry {
  period: string;
  periodNum: number;
  score: number | null;
  target: number | null;
  errors: number;
  textTitle: string;
}

export interface ParentPdfCurriculumItem {
  id: number;
  code: string;
  title: string;
  domain: string;
  subDomain: string;
  score: number;
  target: number;
}

export interface ParentPdfDetailedDomain {
  name: string;
  target: number;
  score: number;
  pct: number;
  subDomains: {
    name: string;
    target: number;
    score: number;
    pct: number;
  }[];
}

export interface ExportParentPdfParams {
  student: Student;
  totalStock: number;
  progressionData: { target: number; score: number; pct: number };
  domainData: ParentPdfDomainSummary[];
  priorityCards: ParentPdfPriorityCard[];
  expertChapters: ChapterExpertEntry[];
  fluenceData: {
    chartData: ParentPdfFluenceEntry[];
    hasData: boolean;
    latestEntry: ParentPdfFluenceEntry | null;
  };
  curriculumData: {
    itemsCount: number;
    chartData: ParentPdfCurriculumItem[];
    summary: {
      totalScore: number;
      totalTarget: number;
      pct: number;
      count3: number;
      count2: number;
      count1: number;
      count0: number;
    };
  };
  detailedDomainData: ParentPdfDetailedDomain[];
  observation: string;
  profileChartEl?: HTMLElement | null;
  fluenceChartEl?: HTMLElement | null;
  curriculumChartEl?: HTMLElement | null;
}

interface CapturedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Normalise le texte pour l'encodage WinAnsi (Helvetica standard de jsPDF)
 * afin d'éviter tout glyphe corrompu (≥, ≤, emojis, etc.).
 */
function sanitizePdfText(input: string | null | undefined): string {
  if (!input) return '';
  return String(input)
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/→/g, '->')
    .replace(/•/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2026]/g, '...')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim();
}

/**
 * Capture un graphique Recharts (élément <svg>) en PNG haute résolution sur fond blanc.
 */
async function captureSvgChartToPng(containerEl?: HTMLElement | null): Promise<CapturedImage | null> {
  if (!containerEl) return null;

  let svgEl = containerEl.querySelector('svg.recharts-surface') as SVGSVGElement | null;
  if (!svgEl) {
    const svgs = Array.from(containerEl.querySelectorAll('svg')) as SVGSVGElement[];
    svgEl = svgs.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    })[0] || null;
  }
  if (!svgEl) return null;

  const rect = svgEl.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || Number(svgEl.getAttribute('width')) || 700));
  const height = Math.max(1, Math.round(rect.height || Number(svgEl.getAttribute('height')) || 280));
  if (width < 40 || height < 40) return null;

  const cloned = svgEl.cloneNode(true) as SVGSVGElement;
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  cloned.setAttribute('width', String(width));
  cloned.setAttribute('height', String(height));
  cloned.style.fontFamily = 'Helvetica, Arial, sans-serif';

  cloned.querySelectorAll('text').forEach((txt) => {
    if (!txt.getAttribute('font-family')) {
      txt.setAttribute('font-family', 'Helvetica, Arial, sans-serif');
    }
  });

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(cloned);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const blobUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(err);
      image.src = blobUrl;
    });

    const scale = 2.5;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width,
      height,
    };
  } catch (err) {
    console.warn('Impossible de capturer le graphique SVG pour le PDF:', err);
    return null;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export async function exportParentProfilePdf({
  student,
  totalStock,
  progressionData,
  domainData,
  priorityCards,
  expertChapters,
  fluenceData,
  curriculumData,
  detailedDomainData,
  observation,
  profileChartEl,
  fluenceChartEl,
  curriculumChartEl,
}: ExportParentPdfParams): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210
  const pageHeight = doc.internal.pageSize.getHeight(); // 297
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182
  let y = 0;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 16) {
      doc.addPage();
      y = 16;
      return true;
    }
    return false;
  };

  const drawSectionTitle = (title: string, subtitle?: string) => {
    ensureSpace(subtitle ? 15 : 10);
    doc.setFillColor(79, 70, 229); // Indigo 600
    doc.roundedRect(margin, y, 2.2, subtitle ? 8.5 : 5.5, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(sanitizePdfText(title), margin + 4.5, y + 4.2);

    if (subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(sanitizePdfText(subtitle), margin + 4.5, y + 8.5);
      y += 12;
    } else {
      y += 8.5;
    }
  };

  const drawProgressBar = (
    x: number,
    barY: number,
    width: number,
    height: number,
    pct: number,
    fillRgb: [number, number, number],
    bgRgb: [number, number, number] = [226, 232, 240]
  ) => {
    const clamped = Math.max(0, Math.min(100, pct));
    doc.setFillColor(...bgRgb);
    doc.roundedRect(x, barY, width, height, height / 2, height / 2, 'F');
    if (clamped > 0) {
      const fillW = Math.max(height, (width * clamped) / 100);
      doc.setFillColor(...fillRgb);
      doc.roundedRect(x, barY, Math.min(width, fillW), height, height / 2, height / 2, 'F');
    }
  };

  const studentFullName = sanitizePdfText(`${student.firstName} ${student.lastName.toUpperCase()}`);
  const studentGrade = sanitizePdfText(student.grade);
  const todayLabel = new Date().toLocaleDateString('fr-FR');

  // --- 1. BANDEAU EN-TÊTE ---
  doc.setFillColor(67, 56, 202); // Indigo 700
  doc.rect(0, 0, pageWidth, 31, 'F');
  doc.setFillColor(16, 185, 129); // Emerald 500 accent strip
  doc.rect(0, 31, pageWidth, 1.4, 'F');

  doc.setTextColor(224, 231, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PORTAIL FAMILLE — BILAN INDIVIDUEL', margin, 9.5);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(studentFullName, margin, 18.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(224, 231, 255);
  doc.text(`Niveau : ${studentGrade}`, margin, 25.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Édité le ${todayLabel}`, pageWidth - margin, 11, { align: 'right' });

  // Badge Total réussites dans l'en-tête
  doc.setFillColor(49, 46, 129); // Indigo 900
  doc.roundedRect(pageWidth - margin - 44, 14.5, 44, 12.5, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(199, 210, 254);
  doc.text('TOTAL RÉUSSITES', pageWidth - margin - 22, 19.2, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(`${totalStock} pts`, pageWidth - margin - 22, 24.8, { align: 'center' });

  y = 38;

  // --- 2. QUATRE CARTES KPI ---
  const cardGap = 4;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  const cardHeight = 20;

  const over5Count = expertChapters.filter((e) => e.tier === 'expert_over_5').length;
  const at5Count = expertChapters.length - over5Count;

  const kpis = [
    {
      label: 'Maîtrise globale',
      value: progressionData.target > 0 ? `${progressionData.pct.toFixed(1).replace('.', ',')} %` : '—',
      sub: progressionData.target > 0 ? `${progressionData.score} / ${progressionData.target} briques` : 'En cours',
      accent: [4, 120, 87] as [number, number, number],
    },
    {
      label: "Badges d'expert.e",
      value: `${expertChapters.length}`,
      sub: `${over5Count} (>5/5) · ${at5Count} (5/5)`,
      accent: [6, 95, 70] as [number, number, number],
    },
    {
      label: 'Fluence (récent)',
      value: fluenceData.latestEntry ? `${fluenceData.latestEntry.score} MCLM` : '—',
      sub: fluenceData.latestEntry
        ? `${fluenceData.latestEntry.period}${fluenceData.latestEntry.target ? ` (obj. ${fluenceData.latestEntry.target})` : ''}`
        : 'Aucune mesure',
      accent: [67, 56, 202] as [number, number, number],
    },
    {
      label: 'Curriculum',
      value:
        curriculumData.summary.totalTarget > 0
          ? `${curriculumData.summary.pct.toFixed(1).replace('.', ',')} %`
          : '—',
      sub:
        curriculumData.summary.totalTarget > 0
          ? `${curriculumData.summary.totalScore} / ${curriculumData.summary.totalTarget} pts`
          : 'Non renseigné',
      accent: [15, 23, 42] as [number, number, number],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (cardWidth + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(100, 116, 139);
    doc.text(sanitizePdfText(kpi.label), x + 3, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...kpi.accent);
    doc.text(sanitizePdfText(kpi.value), x + 3, y + 12.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const subLines = doc.splitTextToSize(sanitizePdfText(kpi.sub), cardWidth - 6);
    doc.text(subLines[0] || '', x + 3, y + 17.2);
  });

  y += cardHeight + 7;

  // --- 3. PROFIL D'APPRENTISSAGE ---
  drawSectionTitle(
    "Profil d'apprentissage",
    'Comparaison des performances avec la moyenne de la classe sur les domaines travaillés.'
  );

  if (progressionData.target > 0) {
    ensureSpace(17);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 14.5, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text("Progression vers l'objectif de maîtrise", margin + 3.5, y + 5.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(4, 120, 87);
    doc.text(
      `${progressionData.score} / ${progressionData.target} briques (${progressionData.pct.toFixed(1).replace('.', ',')} %)`,
      margin + contentWidth - 3.5,
      y + 5.2,
      { align: 'right' }
    );

    drawProgressBar(margin + 3.5, y + 7.8, contentWidth - 7, 3.6, progressionData.pct, [16, 185, 129]);
    y += 18;
  }

  const profileChartImg = await captureSvgChartToPng(profileChartEl);
  if (profileChartImg) {
    const targetImgWidth = contentWidth - 6;
    const ratio = profileChartImg.height / profileChartImg.width;
    const targetImgHeight = Math.min(72, targetImgWidth * ratio);
    const boxHeight = targetImgHeight + 13;

    ensureSpace(boxHeight + 4);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'FD');

    // Légende vectorielle nette en haut de la carte
    const legendItems: { label: string; color: [number, number, number]; type: 'circle' | 'square' }[] = [
      { label: 'Élève', color: [147, 51, 234], type: 'circle' },
      { label: 'Moyenne Classe', color: [37, 99, 235], type: 'circle' },
      { label: 'Amorcé (< 3)', color: [209, 250, 229], type: 'square' },
      { label: 'En cours (3-4)', color: [110, 231, 183], type: 'square' },
      { label: 'Validé (>= 5)', color: [16, 185, 129], type: 'square' },
    ];
    let lx = margin + 4;
    const ly = y + 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    legendItems.forEach((item) => {
      doc.setFillColor(...item.color);
      if (item.type === 'circle') {
        doc.circle(lx + 1.5, ly - 0.8, 1.4, 'F');
      } else {
        doc.rect(lx, ly - 2.1, 2.6, 2.6, 'F');
      }
      doc.setTextColor(71, 85, 105);
      doc.text(item.label, lx + 4.2, ly);
      lx += doc.getTextWidth(item.label) + 9;
    });

    const drawWidth = targetImgHeight / ratio;
    const offsetX = margin + (contentWidth - drawWidth) / 2;
    doc.addImage(profileChartImg.dataUrl, 'PNG', offsetX, y + 9, drawWidth, targetImgHeight);
    y += boxHeight + 5;
  }

  // Tableau synthétique des scores par domaine (précision chiffrée complémentaire au graphique)
  if (domainData.length > 0) {
    ensureSpace(18);
    const dCols = [
      { header: 'Domaine', width: 92, align: 'left' as const },
      { header: 'Score élève (/5)', width: 32, align: 'right' as const },
      { header: 'Moy. classe (/5)', width: 32, align: 'right' as const },
      { header: 'Points cumulés', width: 26, align: 'right' as const },
    ];

    const drawDomainHeader = () => {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.rect(margin, y, contentWidth, 6.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(51, 65, 85);
      let cx = margin;
      dCols.forEach((c) => {
        const tx = c.align === 'right' ? cx + c.width - 2.5 : cx + 2.5;
        doc.text(c.header, tx, y + 4.4, { align: c.align });
        cx += c.width;
      });
      y += 6.5;
    };

    drawDomainHeader();
    domainData.forEach((dom, idx) => {
      if (y + 6 > pageHeight - 16) {
        doc.addPage();
        y = 16;
        drawDomainHeader();
      }
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 5.8, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + 5.8, margin + contentWidth, y + 5.8);

      const vals = [
        sanitizePdfText(dom.name),
        `${dom.studentRawScore.toFixed(1).replace('.', ',')} / 5`,
        `${dom.cohortRawScore.toFixed(1).replace('.', ',')} / 5`,
        `${dom.studentPoints} pts`,
      ];

      let cx = margin;
      dCols.forEach((c, cIdx) => {
        doc.setFont('helvetica', cIdx === 0 || cIdx === 1 ? 'bold' : 'normal');
        if (cIdx === 1) doc.setTextColor(126, 34, 206);
        else if (cIdx === 2) doc.setTextColor(37, 99, 235);
        else doc.setTextColor(30, 41, 59);
        doc.setFontSize(7.5);
        const tx = c.align === 'right' ? cx + c.width - 2.5 : cx + 2.5;
        const txt = doc.splitTextToSize(vals[cIdx], c.width - 4)[0] || '';
        doc.text(txt, tx, y + 4.1, { align: c.align });
        cx += c.width;
      });
      y += 5.8;
    });
    y += 6;
  }

  // --- 4. JE TRAVAILLE EN PRIORITÉ... ---
  if (priorityCards.length > 0) {
    drawSectionTitle(
      'Je travaille en priorité...',
      "Chapitres ciblés avec l'enseignante et avancement vers l'objectif de validation."
    );

    const colGap = 4;
    const cardW = (contentWidth - colGap) / 2;

    for (let i = 0; i < priorityCards.length; i += 2) {
      const pair = priorityCards.slice(i, i + 2);
      const cardLayouts = pair.map((item) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        const titleLines = doc.splitTextToSize(sanitizePdfText(item.title), cardW - 7);
        const h = 15 + titleLines.length * 3.8 + (item.pct !== null ? 7 : 1);
        return { item, titleLines, h };
      });

      const rowHeight = Math.max(...cardLayouts.map((l) => l.h));
      ensureSpace(rowHeight + 4);

      cardLayouts.forEach((layout, colIdx) => {
        const cx = margin + colIdx * (cardW + colGap);
        const { item, titleLines } = layout;

        doc.setFillColor(240, 253, 244); // Emerald 50 light
        doc.setDrawColor(167, 243, 208); // Emerald 200
        doc.roundedRect(cx, y, cardW, rowHeight, 2, 2, 'FD');

        // Badges domaine + code
        const domLabel = sanitizePdfText(item.subDomain || item.domain);
        const codeLabel = sanitizePdfText(item.code);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        const domW = Math.min(cardW - 34, doc.getTextWidth(domLabel) + 4);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(167, 243, 208);
        doc.roundedRect(cx + 3, y + 2.8, domW, 4.4, 1, 1, 'FD');
        doc.setTextColor(6, 95, 70);
        doc.text(doc.splitTextToSize(domLabel, domW - 2)[0] || '', cx + 5, y + 5.8);

        const codeW = doc.getTextWidth(codeLabel) + 4;
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(cx + 3 + domW + 1.5, y + 2.8, codeW, 4.4, 1, 1, 'FD');
        doc.setTextColor(71, 85, 105);
        doc.text(codeLabel, cx + 3 + domW + 3.5, y + 5.8);

        // Badge score / pourcentage à droite
        const statusBadge =
          item.pct !== null
            ? item.isValidated
              ? item.score !== null && item.score > 5
                ? `Expert+ (${item.score})`
                : 'Validé (5/5)'
              : `${item.pct} %`
            : 'En cours';

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        const badgeW = doc.getTextWidth(statusBadge) + 4.5;
        if (item.isValidated) {
          doc.setFillColor(6, 95, 70);
          doc.roundedRect(cx + cardW - 3 - badgeW, y + 2.8, badgeW, 4.6, 1, 1, 'F');
          doc.setTextColor(255, 255, 255);
        } else {
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(167, 243, 208);
          doc.roundedRect(cx + cardW - 3 - badgeW, y + 2.8, badgeW, 4.6, 1, 1, 'FD');
          doc.setTextColor(6, 95, 70);
        }
        doc.text(statusBadge, cx + cardW - 3 - badgeW / 2, y + 5.9, { align: 'center' });

        // Titre chapitre
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(30, 41, 59);
        let ty = y + 11.2;
        titleLines.forEach((line: string) => {
          doc.text(line, cx + 3, ty);
          ty += 3.8;
        });

        // Barre de progression
        if (item.pct !== null) {
          const barY = y + rowHeight - 8.5;
          const isOver5 = item.score !== null && item.score > 5;
          const barColor: [number, number, number] = isOver5
            ? [6, 95, 70]
            : item.isValidated
              ? [5, 150, 105]
              : item.pct >= 60
                ? [16, 185, 129]
                : [110, 231, 183];
          drawProgressBar(cx + 3, barY, cardW - 6, 2.5, item.pct, barColor);

          const statusCaption = isOver5
            ? 'Objectif dépassé — maîtrise experte !'
            : item.isValidated
              ? 'Objectif de maîtrise atteint !'
              : item.pct >= 80
                ? 'Presque validé — dernière étape'
                : `${item.pct} % vers la validation`;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.8);
          doc.setTextColor(71, 85, 105);
          doc.text(statusCaption, cx + cardW - 3, y + rowHeight - 2.3, { align: 'right' });
        }
      });

      y += rowHeight + 3.5;
    }
    y += 3;
  }

  // --- 5. BADGES D'EXPERT.E ---
  drawSectionTitle(
    "Mes badges d'expert.e",
    'Vert : objectif atteint (5 réussites) · Vert foncé : objectif dépassé (6 à 10 réussites).'
  );

  if (expertChapters.length === 0) {
    ensureSpace(14);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 11, 2, 2, 'FD');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      sanitizePdfText(
        `${student.firstName} n'a pas encore franchi les 5 réussites sur un chapitre. Chaque progrès rapproche du premier badge !`
      ),
      margin + contentWidth / 2,
      y + 6.8,
      { align: 'center' }
    );
    y += 16;
  } else {
    const eCols = [
      { header: 'Code', width: 22, align: 'left' as const },
      { header: 'Domaine / Sous-domaine', width: 46, align: 'left' as const },
      { header: 'Chapitre maîtrisé', width: 88, align: 'left' as const },
      { header: 'Niveau', width: 26, align: 'right' as const },
    ];

    const drawExpertHeader = () => {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(167, 243, 208);
      doc.rect(margin, y, contentWidth, 6.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(6, 95, 70);
      let cx = margin;
      eCols.forEach((c) => {
        const tx = c.align === 'right' ? cx + c.width - 2.5 : cx + 2.5;
        doc.text(c.header, tx, y + 4.4, { align: c.align });
        cx += c.width;
      });
      y += 6.5;
    };

    ensureSpace(16);
    drawExpertHeader();

    expertChapters.forEach((entry) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const titleLines = doc.splitTextToSize(sanitizePdfText(entry.title || entry.code), eCols[2].width - 4);
      const rowH = Math.max(6, titleLines.length * 3.7 + 2.4);

      if (y + rowH > pageHeight - 16) {
        doc.addPage();
        y = 16;
        drawExpertHeader();
      }

      const isOver5 = entry.tier === 'expert_over_5';
      if (isOver5) {
        doc.setFillColor(240, 253, 244);
        doc.rect(margin, y, contentWidth, rowH, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + rowH, margin + contentWidth, y + rowH);

      let cx = margin;
      // Code
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.3);
      doc.setTextColor(51, 65, 85);
      doc.text(sanitizePdfText(entry.code), cx + 2.5, y + 4.2);
      cx += eCols[0].width;

      // Domaine
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      const domTxt = doc.splitTextToSize(sanitizePdfText(entry.subDomain || entry.domain), eCols[1].width - 4)[0] || '';
      doc.text(domTxt, cx + 2.5, y + 4.2);
      cx += eCols[1].width;

      // Titre
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      titleLines.forEach((ln: string, lIdx: number) => {
        doc.text(ln, cx + 2.5, y + 4.1 + lIdx * 3.7);
      });
      cx += eCols[2].width;

      // Badge score
      const badgeLabel = isOver5 ? `Expert+ (${entry.score})` : 'Expert (5/5)';
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      if (isOver5) {
        doc.setTextColor(6, 95, 70);
      } else {
        doc.setTextColor(5, 150, 105);
      }
      doc.text(badgeLabel, cx + eCols[3].width - 2.5, y + 4.2, { align: 'right' });

      y += rowH;
    });
    y += 6;
  }

  // --- 6. PROFIL & PROGRESSION EN FLUENCE ---
  drawSectionTitle(
    'Profil & Progression en Fluence (MCLM)',
    `Évolution de la vitesse de lecture en Mots Correctement Lus par Minute au niveau ${studentGrade}.`
  );

  if (!fluenceData.hasData) {
    ensureSpace(14);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 11, 2, 2, 'FD');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.2);
    doc.setTextColor(100, 116, 139);
    doc.text('Aucune mesure de fluence enregistrée pour le moment.', margin + contentWidth / 2, y + 6.8, {
      align: 'center',
    });
    y += 16;
  } else {
    // 5 cartes P1 -> P5
    ensureSpace(24);
    const fGap = 3;
    const fW = (contentWidth - fGap * 4) / 5;
    const fH = 20;

    fluenceData.chartData.forEach((item, idx) => {
      const fx = margin + idx * (fW + fGap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(fx, y, fW, fH, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(sanitizePdfText(item.period), fx + fW / 2, y + 4.5, { align: 'center' });

      if (item.score !== null) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(67, 56, 202);
        doc.text(`${item.score} MCLM`, fx + fW / 2, y + 10.5, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        doc.setTextColor(100, 116, 139);
        const errTxt = item.errors > 0 ? `${item.errors} err.` : '0 err.';
        const objTxt = item.target ? ` · Obj: ${item.target}` : '';
        doc.text(`${errTxt}${objTxt}`, fx + fW / 2, y + 14.8, { align: 'center' });

        if (item.textTitle) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(6.2);
          doc.setTextColor(148, 163, 184);
          const clippedTitle = doc.splitTextToSize(sanitizePdfText(`"${item.textTitle}"`), fW - 4)[0] || '';
          doc.text(clippedTitle, fx + fW / 2, y + 18.2, { align: 'center' });
        }
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text('—', fx + fW / 2, y + 12, { align: 'center' });
      }
    });
    y += fH + 4;

    const fluenceChartImg = await captureSvgChartToPng(fluenceChartEl);
    if (fluenceChartImg) {
      const targetImgWidth = contentWidth - 6;
      const ratio = fluenceChartImg.height / fluenceChartImg.width;
      const targetImgHeight = Math.min(64, targetImgWidth * ratio);
      const boxHeight = targetImgHeight + 12;

      ensureSpace(boxHeight + 4);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'FD');

      // Légende Fluence
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setFillColor(79, 70, 229);
      doc.circle(margin + 5.5, y + 4.7, 1.3, 'F');
      doc.setTextColor(71, 85, 105);
      const lbl1 = sanitizePdfText(`Score de ${student.firstName} (MCLM)`);
      doc.text(lbl1, margin + 8.5, y + 5.5);

      const x2 = margin + 15 + doc.getTextWidth(lbl1);
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.7);
      doc.line(x2, y + 4.7, x2 + 5, y + 4.7);
      doc.setLineWidth(0.2);
      doc.text(`Seuil visé (${studentGrade})`, x2 + 7, y + 5.5);

      const drawWidth = targetImgHeight / ratio;
      const offsetX = margin + (contentWidth - drawWidth) / 2;
      doc.addImage(fluenceChartImg.dataUrl, 'PNG', offsetX, y + 8.5, drawWidth, targetImgHeight);
      y += boxHeight + 6;
    } else {
      y += 3;
    }
  }

  // --- 7. PROFIL & PROGRESSION DU CURRICULUM ---
  if (curriculumData.itemsCount > 0) {
    drawSectionTitle(
      'Profil & Progression du Curriculum',
      `Compétences du curriculum (${studentGrade}). Objectif cible : 3 points par compétence.`
    );

    ensureSpace(19);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 16.5, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(51, 65, 85);
    doc.text(
      `Taux d'acquisition global (${curriculumData.summary.pct.toFixed(1).replace('.', ',')} %)`,
      margin + 3.5,
      y + 5
    );
    doc.setTextColor(6, 95, 70);
    doc.text(
      `${curriculumData.summary.totalScore} / ${curriculumData.summary.totalTarget} points`,
      margin + contentWidth - 3.5,
      y + 5,
      { align: 'right' }
    );

    drawProgressBar(margin + 3.5, y + 7.2, contentWidth - 7, 3.4, curriculumData.summary.pct, [5, 150, 105]);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.1);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Répartition : ${curriculumData.summary.count3} acquises (3 pts) · ${curriculumData.summary.count2} en cours (2 pts) · ${curriculumData.summary.count1} amorcées (1 pt) · ${curriculumData.summary.count0} non entamées (0 pt)`,
      margin + 3.5,
      y + 14.3
    );
    y += 20;

    const curriculumChartImg = await captureSvgChartToPng(curriculumChartEl);
    if (curriculumChartImg && curriculumData.chartData.length > 0) {
      const targetImgWidth = contentWidth - 6;
      const ratio = curriculumChartImg.height / curriculumChartImg.width;
      const targetImgHeight = Math.min(68, targetImgWidth * ratio);
      const boxHeight = targetImgHeight + 12;

      ensureSpace(boxHeight + 4);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text('Compétences acquises ou en cours (au moins 1 point)', margin + 4, y + 5.5);

      const drawWidth = targetImgHeight / ratio;
      const offsetX = margin + (contentWidth - drawWidth) / 2;
      doc.addImage(curriculumChartImg.dataUrl, 'PNG', offsetX, y + 8.5, drawWidth, targetImgHeight);
      y += boxHeight + 4;
    }

    // Liste détaillée des compétences curriculum avec score >= 1
    if (curriculumData.chartData.length > 0) {
      const cCols = [
        { header: 'Code', width: 22, align: 'left' as const },
        { header: 'Sous-domaine', width: 42, align: 'left' as const },
        { header: 'Compétence', width: 96, align: 'left' as const },
        { header: 'Score', width: 22, align: 'right' as const },
      ];

      const drawCurrHeader = () => {
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(203, 213, 225);
        doc.rect(margin, y, contentWidth, 6.2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(51, 65, 85);
        let cx = margin;
        cCols.forEach((c) => {
          const tx = c.align === 'right' ? cx + c.width - 2.5 : cx + 2.5;
          doc.text(c.header, tx, y + 4.3, { align: c.align });
          cx += c.width;
        });
        y += 6.2;
      };

      ensureSpace(15);
      drawCurrHeader();

      curriculumData.chartData.forEach((item, idx) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        const titleLines = doc.splitTextToSize(sanitizePdfText(item.title), cCols[2].width - 4);
        const rowH = Math.max(5.6, titleLines.length * 3.5 + 2.1);

        if (y + rowH > pageHeight - 16) {
          doc.addPage();
          y = 16;
          drawCurrHeader();
        }

        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(margin, y, contentWidth, rowH, 'F');
        }
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y + rowH, margin + contentWidth, y + rowH);

        let cx = margin;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(51, 65, 85);
        doc.text(sanitizePdfText(item.code), cx + 2.5, y + 4);
        cx += cCols[0].width;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        const subTxt = doc.splitTextToSize(sanitizePdfText(item.subDomain), cCols[1].width - 4)[0] || '';
        doc.text(subTxt, cx + 2.5, y + 4);
        cx += cCols[1].width;

        doc.setTextColor(30, 41, 59);
        titleLines.forEach((ln: string, lIdx: number) => {
          doc.text(ln, cx + 2.5, y + 4 + lIdx * 3.5);
        });
        cx += cCols[2].width;

        doc.setFont('helvetica', 'bold');
        if (item.score === 3) doc.setTextColor(6, 95, 70);
        else if (item.score === 2) doc.setTextColor(16, 185, 129);
        else doc.setTextColor(51, 65, 85);
        doc.text(`${item.score} / 3`, cx + cCols[3].width - 2.5, y + 4, { align: 'right' });

        y += rowH;
      });
      y += 6;
    }
  }

  // --- 8. DÉTAIL PAR DOMAINES & SOUS-DOMAINES ---
  if (detailedDomainData.length > 0) {
    drawSectionTitle('Détail par Domaines et Sous-domaines');

    detailedDomainData.forEach((dom) => {
      ensureSpace(14);
      // Ligne domaine parent
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, y, contentWidth, 9.5, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      const domName = doc.splitTextToSize(sanitizePdfText(dom.name), 78)[0] || '';
      doc.text(domName, margin + 3, y + 6);

      // Barre de progression à droite
      const barW = 55;
      const barX = margin + contentWidth - barW - 42;
      drawProgressBar(barX, y + 3.4, barW, 2.8, dom.pct, [6, 78, 59], [226, 232, 240]);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(6, 78, 59);
      doc.text(
        `${dom.score}/${dom.target} (${dom.pct.toFixed(1).replace('.', ',')} %)`,
        margin + contentWidth - 3,
        y + 5.9,
        { align: 'right' }
      );
      y += 10.5;

      // Sous-domaines
      dom.subDomains.forEach((sub) => {
        ensureSpace(7);
        doc.setDrawColor(241, 245, 249);
        doc.line(margin + 5, y + 6.2, margin + contentWidth, y + 6.2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(71, 85, 105);
        const subName = doc.splitTextToSize(sanitizePdfText(sub.name), 74)[0] || '';
        doc.text(`- ${subName}`, margin + 5.5, y + 4.3);

        drawProgressBar(barX, y + 2.2, barW, 2.2, sub.pct, [110, 231, 183], [226, 232, 240]);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `${sub.score}/${sub.target} (${sub.pct.toFixed(1).replace('.', ',')} %)`,
          margin + contentWidth - 3,
          y + 4.3,
          { align: 'right' }
        );
        y += 6.4;
      });

      y += 3;
    });
    y += 3;
  }

  // --- 9. OBSERVATIONS DE L'ENSEIGNANT ---
  const cleanObs = sanitizePdfText(observation);
  if (cleanObs) {
    drawSectionTitle("Observations de l'enseignant");

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    const paragraphs = cleanObs.split(/\r?\n/);
    const obsLines: string[] = [];
    paragraphs.forEach((p) => {
      if (!p.trim()) {
        obsLines.push('');
      } else {
        obsLines.push(...doc.splitTextToSize(p, contentWidth - 10));
      }
    });

    const lineH = 4.5;
    let idx = 0;
    while (idx < obsLines.length) {
      const availH = pageHeight - 16 - y - 8;
      const maxLines = Math.max(1, Math.floor(availH / lineH));
      if (availH < 14) {
        doc.addPage();
        y = 16;
        continue;
      }

      const chunk = obsLines.slice(idx, idx + maxLines);
      const boxH = chunk.length * lineH + 8;

      doc.setFillColor(255, 251, 235); // Amber 50
      doc.setDrawColor(253, 230, 138); // Amber 200
      doc.roundedRect(margin, y, contentWidth, boxH, 2, 2, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.8);
      doc.setTextColor(51, 65, 85);
      let ty = y + 6;
      chunk.forEach((ln) => {
        if (ln) doc.text(ln, margin + 5, ty);
        ty += lineH;
      });

      y += boxH + 4;
      idx += chunk.length;
    }
  }

  // --- 10. PIED DE PAGE SUR TOUTES LES PAGES ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Portail Famille — ${studentFullName} (${studentGrade}) · Édité le ${todayLabel}`,
      margin,
      pageHeight - 7.5
    );
    doc.text(`Page ${p} / ${totalPages}`, pageWidth - margin, pageHeight - 7.5, { align: 'right' });
  }

  const slug = `${student.lastName}_${student.firstName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);

  doc.save(`Bilan_${slug || 'Eleve'}.pdf`);
}
