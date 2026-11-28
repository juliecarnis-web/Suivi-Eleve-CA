import { jsPDF } from 'jspdf';
import { ComputedPeriodStats, ComputedStudentAbsenceSummary, formatDateFr } from './absences';

interface ExportAbsencePdfParams {
  title: string;
  schoolYear: string;
  gradeLabel?: string;
  teacherName?: string;
  summary: ComputedPeriodStats;
  rows: ComputedPeriodStats[];
  studentRows?: ComputedStudentAbsenceSummary[];
  alertStudentIds?: Set<string>;
  includeStudentDetail?: boolean;
  chartContainerEl?: HTMLElement | null;
}

interface CapturedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Capture un graphique Recharts (élément <svg>) en PNG haute résolution sur fond blanc.
 * Évite tout parsing CSS oklch() en sérialisant directement le SVG vectoriel.
 */
async function captureSvgChartToPng(containerEl?: HTMLElement | null): Promise<CapturedImage | null> {
  if (!containerEl) return null;
  const svgEl = containerEl.querySelector('svg.recharts-surface') as SVGSVGElement | null;
  if (!svgEl) return null;

  const rect = svgEl.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || Number(svgEl.getAttribute('width')) || 700));
  const height = Math.max(1, Math.round(rect.height || Number(svgEl.getAttribute('height')) || 300));

  const cloned = svgEl.cloneNode(true) as SVGSVGElement;
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  cloned.setAttribute('width', String(width));
  cloned.setAttribute('height', String(height));
  cloned.style.fontFamily = 'Helvetica, Arial, sans-serif';

  // Assurer la lisibilité des libellés texte dans le SVG cloné
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

function fmtNum(val: number, decimals = 1): string {
  const rounded = decimals === 0 ? Math.round(val) : Number(val.toFixed(decimals));
  return String(rounded).replace('.', ',');
}

export async function exportAbsenceReportPdf({
  title,
  schoolYear,
  gradeLabel,
  teacherName,
  summary,
  rows,
  studentRows,
  alertStudentIds,
  includeStudentDetail = true,
  chartContainerEl,
}: ExportAbsencePdfParams): Promise<void> {
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
    }
  };

  const safeGrade = gradeLabel && gradeLabel.trim() ? gradeLabel.trim() : 'Classe entière';
  const safeTeacher = teacherName && teacherName.trim() ? teacherName.trim() : 'Julie Carnis-Bréart';

  // --- 1. BANDEAU EN-TÊTE ---
  doc.setFillColor(67, 56, 202); // Indigo 700
  doc.rect(0, 0, pageWidth, 29, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`Bilan d'absentéisme — ${safeGrade}`, margin, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(224, 231, 255);
  doc.text(
    `${title}  ·  Du ${formatDateFr(summary.startDate)} au ${formatDateFr(summary.endDate)}`,
    margin,
    17.5
  );
  doc.text(
    `Enseignant(e) titulaire : ${safeTeacher}`,
    margin,
    23.5
  );

  const todayLabel = `Édité le ${new Date().toLocaleDateString('fr-FR')}`;
  doc.setFontSize(8.5);
  doc.text(todayLabel, pageWidth - margin, 11, { align: 'right' });
  doc.text(`Année scolaire ${schoolYear}`, pageWidth - margin, 17.5, { align: 'right' });

  y = 35;

  // --- 2. QUATRE CARTES KPI ---
  const cardGap = 4;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  const cardHeight = 20;

  const kpis = [
    {
      label: 'Jours ouvrés',
      value: `${summary.workingDays} j`,
      sub: `${summary.workingHalfDays} demi-journées`,
      accent: [15, 23, 42] as [number, number, number],
    },
    {
      label: 'Présences possibles',
      value: `${summary.possiblePresences}`,
      sub: `Effectif moy. : ${fmtNum(summary.headcount)} élèves`,
      accent: [15, 23, 42] as [number, number, number],
    },
    {
      label: 'Absences relevées',
      value: `${fmtNum(summary.absentHalfDays)} ½j`,
      sub: `${fmtNum(summary.justifiedHalfDays)} just. · ${fmtNum(summary.unjustifiedHalfDays)} non just.`,
      accent: [15, 23, 42] as [number, number, number],
    },
    {
      label: "Taux d'absence",
      value: `${summary.absenceRate.toFixed(2).replace('.', ',')} %`,
      sub: 'Absences / Présences poss.',
      accent: (summary.absenceRate >= 10
        ? [185, 28, 28]
        : summary.absenceRate >= 5
          ? [180, 83, 9]
          : [4, 120, 87]) as [number, number, number],
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (cardWidth + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...kpi.accent);
    doc.text(kpi.value, x + 3, y + 12.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.sub, x + 3, y + 17.2);
  });

  y += cardHeight + 6;

  // --- 3. SYNTHÈSE TEXTE MISE EN PAGE ---
  const alertCount = alertStudentIds ? alertStudentIds.size : 0;
  const synthesisLines = [
    `- Classe / Niveau ciblé : ${safeGrade}  |  Enseignant(e) titulaire : ${safeTeacher}.`,
    `- Période analysée : ${title} (du ${formatDateFr(summary.startDate)} au ${formatDateFr(summary.endDate)}).`,
    `- Temps scolaire effectif : ${summary.workingDays} jours de classe, soit ${summary.workingHalfDays} demi-journées ouvrées (hors week-ends, vacances et jours fériés).`,
    `- Base de calcul : ${fmtNum(summary.headcount)} élèves en moyenne, soit ${summary.possiblePresences} présences possibles.`,
    `- Volume d'absences : ${fmtNum(summary.absentHalfDays)} demi-journées au total (${fmtNum(summary.justifiedHalfDays)} justifiées, ${fmtNum(summary.unjustifiedHalfDays)} non justifiées).`,
    `- Taux d'absence global de la classe : ${summary.absenceRate.toFixed(2).replace('.', ',')} %${
      alertCount > 0
        ? ` — ${alertCount} élève${alertCount > 1 ? 's ont' : ' a'} atteint le seuil d'alerte (>= 4 demi-journées sur un mois).`
        : '.'
    }`,
  ];
  if (summary.isProrated) {
    synthesisLines.push(
      '- Note : la plage libre sélectionnée coupe un mois en cours ; les totaux sont proratisés au prorata des demi-journées ouvrées.'
    );
  }

  const wrappedLines: string[] = [];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  synthesisLines.forEach((line) => {
    const split = doc.splitTextToSize(line, contentWidth - 8);
    wrappedLines.push(...split);
  });

  const synthBoxHeight = 10 + wrappedLines.length * 4.3;
  ensureSpace(synthBoxHeight + 4);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, synthBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text('Synthèse de la période', margin + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  let textY = y + 11.5;
  wrappedLines.forEach((line) => {
    doc.text(line, margin + 4, textY);
    textY += 4.3;
  });

  y += synthBoxHeight + 6;

  // --- 4. GRAPHE CLASSE ---
  const chartImage = await captureSvgChartToPng(chartContainerEl);
  if (chartImage) {
    const targetImgWidth = contentWidth - 6;
    const ratio = chartImage.height / chartImage.width;
    const targetImgHeight = Math.min(76, targetImgWidth * ratio);
    const boxHeight = targetImgHeight + 13;

    ensureSpace(boxHeight + 4);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text("Évolution du taux d'absence et volume classe (demi-journées)", margin + 4, y + 6);

    const drawWidth = targetImgHeight / ratio;
    const offsetX = margin + (contentWidth - drawWidth) / 2;
    doc.addImage(chartImage.dataUrl, 'PNG', offsetX, y + 9.5, drawWidth, targetImgHeight);

    y += boxHeight + 6;
  }

  // --- 5. TABLEAU DÉTAILLÉ DES TRANCHES ---
  if (rows.length > 0) {
    ensureSpace(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text('Détail par mois / période', margin, y + 4);
    y += 7;

    const cols = [
      { header: 'Mois / Période', width: 38, align: 'left' as const },
      { header: 'Dates', width: 34, align: 'left' as const },
      { header: 'Jours', width: 18, align: 'right' as const },
      { header: 'Eff.', width: 12, align: 'right' as const },
      { header: 'Prés. poss.', width: 20, align: 'right' as const },
      { header: 'Abs. (½j)', width: 16, align: 'right' as const },
      { header: 'Just.', width: 14, align: 'right' as const },
      { header: 'Non just.', width: 15, align: 'right' as const },
      { header: 'Taux', width: 15, align: 'right' as const },
    ];

    const drawTableHeader = () => {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.rect(margin, y, contentWidth, 7, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.3);
      doc.setTextColor(51, 65, 85);

      let cx = margin;
      cols.forEach((col) => {
        const tx = col.align === 'right' ? cx + col.width - 2 : cx + 2;
        doc.text(col.header, tx, y + 4.7, { align: col.align });
        cx += col.width;
      });
      y += 7;
    };

    drawTableHeader();

    rows.forEach((r, idx) => {
      if (y + 6.5 > pageHeight - 16) {
        doc.addPage();
        y = 16;
        drawTableHeader();
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentWidth, 6.2, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + 6.2, margin + contentWidth, y + 6.2);

      const values = [
        r.label,
        `${formatDateFr(r.startDate)} - ${formatDateFr(r.endDate)}`,
        `${r.workingDays}j (${r.workingHalfDays})`,
        fmtNum(r.headcount),
        String(r.possiblePresences),
        fmtNum(r.absentHalfDays),
        fmtNum(r.justifiedHalfDays),
        fmtNum(r.unjustifiedHalfDays),
        `${r.absenceRate.toFixed(2).replace('.', ',')} %`,
      ];

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(30, 41, 59);

      let cx = margin;
      cols.forEach((col, cIdx) => {
        if (cIdx === cols.length - 1) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(67, 56, 202);
        } else {
          doc.setFont('helvetica', cIdx === 0 ? 'bold' : 'normal');
          doc.setTextColor(30, 41, 59);
        }
        const tx = col.align === 'right' ? cx + col.width - 2 : cx + 2;
        const cellText = doc.splitTextToSize(values[cIdx], col.width - 3)[0] || '';
        doc.text(cellText, tx, y + 4.3, { align: col.align });
        cx += col.width;
      });

      y += 6.2;
    });

    if (rows.length > 1) {
      if (y + 7 > pageHeight - 16) {
        doc.addPage();
        y = 16;
      }
      doc.setFillColor(238, 242, 255);
      doc.rect(margin, y, contentWidth, 6.8, 'F');
      doc.setDrawColor(199, 210, 254);
      doc.line(margin, y + 6.8, margin + contentWidth, y + 6.8);

      const totDays = rows.reduce((s, r) => s + r.workingDays, 0);
      const totHalf = rows.reduce((s, r) => s + r.workingHalfDays, 0);
      const totPossible = rows.reduce((s, r) => s + r.possiblePresences, 0);
      const totAbs = rows.reduce((s, r) => s + r.absentHalfDays, 0);
      const totJust = rows.reduce((s, r) => s + r.justifiedHalfDays, 0);
      const totUnjust = Math.max(0, totAbs - totJust);
      const totRate = totPossible > 0 ? (totAbs / totPossible) * 100 : 0;

      const totVals = [
        'TOTAL',
        `${formatDateFr(rows[0].startDate)} - ${formatDateFr(rows[rows.length - 1].endDate)}`,
        `${totDays}j (${totHalf})`,
        '-',
        String(totPossible),
        fmtNum(totAbs),
        fmtNum(totJust),
        fmtNum(totUnjust),
        `${totRate.toFixed(2).replace('.', ',')} %`,
      ];

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 27, 75);
      let cx = margin;
      cols.forEach((col, cIdx) => {
        const tx = col.align === 'right' ? cx + col.width - 2 : cx + 2;
        doc.text(totVals[cIdx], tx, y + 4.6, { align: col.align });
        cx += col.width;
      });
      y += 8;
    } else {
      y += 4;
    }
  }

  // --- 6. SUIVI INDIVIDUEL DES ÉLÈVES (OPTIONNEL) ---
  const activeAbsentStudents = (studentRows || []).filter((s) => s.absentHalfDays > 0);
  if (includeStudentDetail && activeAbsentStudents.length > 0) {
    y += 3;
    ensureSpace(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text("Suivi individuel des élèves (seuil d'alerte : >= 4 ½j / mois)", margin, y + 4);
    y += 7;

    const sCols = [
      { header: 'Élève', width: 66, align: 'left' as const },
      { header: 'Niveau', width: 22, align: 'left' as const },
      { header: 'Absences (½j)', width: 26, align: 'right' as const },
      { header: 'Justifiées', width: 24, align: 'right' as const },
      { header: 'Taux', width: 20, align: 'right' as const },
      { header: 'Statut', width: 24, align: 'right' as const },
    ];

    const drawStudentHeader = () => {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.rect(margin, y, contentWidth, 6.8, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.3);
      doc.setTextColor(51, 65, 85);
      let cx = margin;
      sCols.forEach((col) => {
        const tx = col.align === 'right' ? cx + col.width - 2 : cx + 2;
        doc.text(col.header, tx, y + 4.6, { align: col.align });
        cx += col.width;
      });
      y += 6.8;
    };

    drawStudentHeader();

    activeAbsentStudents.forEach((st) => {
      if (y + 6.2 > pageHeight - 16) {
        doc.addPage();
        y = 16;
        drawStudentHeader();
      }
      const isAlert = alertStudentIds?.has(st.studentId) ?? false;
      if (isAlert) {
        doc.setFillColor(255, 241, 242);
        doc.rect(margin, y, contentWidth, 6, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + 6, margin + contentWidth, y + 6);

      const vals = [
        `${st.lastName} ${st.firstName}`.trim(),
        st.grade,
        fmtNum(st.absentHalfDays),
        fmtNum(st.justifiedHalfDays),
        `${st.absenceRate.toFixed(1).replace('.', ',')} %`,
        isAlert ? 'Alerte >= 4 ½j' : 'Normal',
      ];

      let cx = margin;
      sCols.forEach((col, cIdx) => {
        if (isAlert && (cIdx === 0 || cIdx === 4 || cIdx === 5)) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(185, 28, 28);
        } else {
          doc.setFont('helvetica', cIdx === 0 ? 'bold' : 'normal');
          doc.setTextColor(30, 41, 59);
        }
        const tx = col.align === 'right' ? cx + col.width - 2 : cx + 2;
        doc.text(vals[cIdx], tx, y + 4.2, { align: col.align });
        cx += col.width;
      });

      y += 6;
    });
  }

  // --- 7. PIED DE PAGE SUR TOUTES LES PAGES ---
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Suivi Élèves — ${safeGrade} (${safeTeacher}) — ${schoolYear}`,
      margin,
      pageHeight - 8
    );
    doc.text(`Page ${p} / ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  const slug = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  doc.save(`Bilan_Absences_${slug || schoolYear}.pdf`);
}
