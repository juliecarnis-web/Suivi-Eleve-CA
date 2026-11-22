import React, { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line
} from 'recharts';
import { Student, CurriculumItem, CurriculumResult } from '../../types';
import { Users, User, BarChart2, Award, TrendingUp, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

interface CurriculumChartsProps {
  students: Student[];
  curriculumItems: CurriculumItem[];
  curriculumResults: CurriculumResult[];
  selectedGrade: string;
}

export default function CurriculumCharts({
  students,
  curriculumItems,
  curriculumResults,
  selectedGrade
}: CurriculumChartsProps) {
  const [chartMode, setChartMode] = useState<'class' | 'student'>('class');

  // Élèves actifs filtrés par niveau
  const activeStudents = students.filter(s => !s.isArchived && (selectedGrade === 'all' || s.grade === selectedGrade));
  const [selectedStudentId, setSelectedStudentId] = useState<string>(activeStudents[0]?.id || '');

  // Compétences filtrées par niveau
  const activeItems = curriculumItems.filter(i => selectedGrade === 'all' || i.grade === selectedGrade);

  // 1. Préparation des données pour la "Vue Classe"
  const classChartData = activeItems.map(item => {
    let countScore3 = 0; // 3 pts (Vert foncé / Max)
    let countScore2 = 0; // 2 pts (Vert moyen)
    let countScore1 = 0; // 1 pt (Vert clair)
    let countScore0 = 0; // 0 pt (Non démarré)

    activeStudents.forEach(st => {
      const res = curriculumResults.find(
        r => r.studentId === st.id && r.curriculumId === item.id
      );
      const score = res?.score ?? 0;
      if (score === 3) countScore3++;
      else if (score === 2) countScore2++;
      else if (score === 1) countScore1++;
      else countScore0++;
    });

    const totalStudents = activeStudents.length || 1;
    const percentAcquis = Math.round((countScore3 / totalStudents) * 100);

    return {
      code: item.code,
      title: item.title,
      domain: item.domain,
      subDomain: item.subDomain || 'Sans sous-domaine',
      '3 pts (Vert foncé)': countScore3,
      '2 pts (Vert moyen)': countScore2,
      '1 pt (Vert clair)': countScore1,
      '0 pt (Non entamé)': countScore0,
      percentAcquis
    };
  });

  // Calcul du taux d'acquisition global de la classe
  const totalEvaluatedCells = activeStudents.length * activeItems.length;
  let totalScore3Count = 0;
  let totalScore2Count = 0;
  let totalScore1Count = 0;

  activeStudents.forEach(st => {
    activeItems.forEach(item => {
      const res = curriculumResults.find(
        r => r.studentId === st.id && r.curriculumId === item.id
      );
      const score = res?.score ?? 0;
      if (score === 3) totalScore3Count++;
      else if (score === 2) totalScore2Count++;
      else if (score === 1) totalScore1Count++;
    });
  });

  const globalPercentScore3 = totalEvaluatedCells > 0 ? Math.round((totalScore3Count / totalEvaluatedCells) * 100) : 0;
  const globalPercentScore2 = totalEvaluatedCells > 0 ? Math.round((totalScore2Count / totalEvaluatedCells) * 100) : 0;
  const globalPercentScore1 = totalEvaluatedCells > 0 ? Math.round((totalScore1Count / totalEvaluatedCells) * 100) : 0;

  // 2. Préparation des données pour la "Vue Élève"
  const currentStudent = activeStudents.find(s => s.id === selectedStudentId) || activeStudents[0];

  const studentItemScores = activeItems.map(item => {
    const res = curriculumResults.find(
      r => r.studentId === currentStudent?.id && r.curriculumId === item.id
    );
    return {
      code: item.code,
      title: item.title,
      domain: item.domain,
      subDomain: item.subDomain || 'Sans sous-domaine',
      Score: res ? res.score : 0,
      Target: 3 // Objectif fixe niveau 3
    };
  });

  // Évolution sur les 3 évaluations pour l'élève sélectionné
  const studentProgressionData = [1, 2, 3].map(evalNum => {
    let evalScoresSum = 0;
    let evalScoresCount = 0;

    activeItems.forEach(item => {
      const res = curriculumResults.find(
        r => r.studentId === currentStudent?.id && r.curriculumId === item.id && r.evaluationNum === evalNum
      );
      if (res && res.score !== undefined && res.score !== null) {
        evalScoresSum += res.score;
        evalScoresCount++;
      }
    });

    const averageScore = evalScoresCount > 0 ? Number((evalScoresSum / evalScoresCount).toFixed(2)) : 0;

    return {
      evaluation: `Évaluation ${evalNum}`,
      Moyenne: averageScore,
      Target: 3
    };
  });

  return (
    <div className="space-y-6">
      {/* Bascule entre Vue Classe et Profil Élève */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
          <button
            onClick={() => setChartMode('class')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              chartMode === 'class'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-indigo-600" />
            Vue d'ensemble Classe
          </button>
          <button
            onClick={() => setChartMode('student')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              chartMode === 'student'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4 text-indigo-600" />
            Profil Individuel Élève
          </button>
        </div>

        {chartMode === 'student' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sélectionner Élève :</span>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 shadow-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none min-w-[200px]"
            >
              {activeStudents.map(s => (
                <option key={s.id} value={s.id}>
                  {s.lastName.toUpperCase()} {s.firstName} ({s.grade})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {chartMode === 'class' ? (
        <div className="space-y-6">
          {/* Cartes de synthèse de la classe */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-emerald-800/10 border border-emerald-300 rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-800 text-white flex items-center justify-center font-extrabold text-lg shadow-xs">
                {globalPercentScore3}%
              </div>
              <div>
                <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-800" />
                  3 Points (Vert foncé / Acquis)
                </h4>
                <p className="text-xs text-emerald-800 mt-0.5">
                  {totalScore3Count} validations sur {totalEvaluatedCells} paires élève/compétence.
                </p>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-lg shadow-xs">
                {globalPercentScore2}%
              </div>
              <div>
                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  2 Points (Vert moyen)
                </h4>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {totalScore2Count} compétences au niveau 2.
                </p>
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-200 text-emerald-800 flex items-center justify-center font-bold text-lg shadow-xs">
                {globalPercentScore1}%
              </div>
              <div>
                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-500" />
                  1 Point (Vert clair)
                </h4>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {totalScore1Count} compétences amorcées (1 pt).
                </p>
              </div>
            </div>
          </div>

          {/* Graphique à barres empilées de la classe */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Niveau de maîtrise par compétence</h3>
                <p className="text-xs text-slate-500">
                  Répartition du nombre d'élèves selon le nombre de points obtenus (0 à 3).
                </p>
              </div>
            </div>

            {classChartData.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Aucune compétence disponible pour afficher le graphique.
              </div>
            ) : (
              <div className="h-[380px] w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classChartData} margin={{ top: 20, right: 30, left: 10, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="code"
                      tick={{ fontSize: 11, fill: '#475569' }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#475569' }} allowDecimals={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900 text-white text-xs rounded-lg p-3 shadow-xl max-w-xs space-y-1.5">
                              <p className="font-bold text-emerald-300">{data.code} — {data.title}</p>
                              <p className="text-[11px] text-slate-300">Sous-domaine : {data.subDomain}</p>
                              <div className="border-t border-slate-700 pt-1.5 space-y-1">
                                <p className="text-emerald-300">🟩 3 pts (Vert foncé) : {data['3 pts (Vert foncé)']} élève(s)</p>
                                <p className="text-emerald-400">🟢 2 pts (Vert moyen) : {data['2 pts (Vert moyen)']} élève(s)</p>
                                <p className="text-emerald-200">🌱 1 pt (Vert clair) : {data['1 pt (Vert clair)']} élève(s)</p>
                                <p className="text-slate-400">⬜ 0 pt (Non entamé) : {data['0 pt (Non entamé)']} élève(s)</p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                    <Bar dataKey="3 pts (Vert foncé)" stackId="a" fill="#065F46" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="2 pts (Vert moyen)" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="1 pt (Vert clair)" stackId="a" fill="#A7F3D0" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="0 pt (Non entamé)" stackId="a" fill="#F1F5F9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {!currentStudent ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs text-slate-500">
              Veuillez sélectionner un élève pour consulter son profil.
            </div>
          ) : (
            <>
              {/* Carte profil élève */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-base flex items-center justify-center">
                    {currentStudent.firstName.charAt(0)}{currentStudent.lastName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">
                      {currentStudent.firstName} {currentStudent.lastName.toUpperCase()}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Niveau : <span className="font-semibold text-slate-700">{currentStudent.grade}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
                  <div>
                    <span className="text-slate-500">Objectif visé :</span>
                    <span className="ml-1.5 font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">3 Points (Vert foncé)</span>
                  </div>
                </div>
              </div>

              {/* Graphique du profil élève (Barres vs Objectif 3) */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-slate-800 flex items-center flex-wrap gap-2">
                  <Award className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Score par compétence (0 à 3 points)</span>
                  {currentStudent && (
                    <span className="text-xs font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-indigo-600" />
                      Élève : {currentStudent.firstName} {currentStudent.lastName.toUpperCase()} ({currentStudent.grade})
                    </span>
                  )}
                </h4>
                <p className="text-xs text-slate-500">Points cumulés comparés à l'objectif de validation complète (3 pts).</p>

                <div className="h-[340px] w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={studentItemScores} margin={{ top: 20, right: 20, left: 0, bottom: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#475569' }} angle={-30} textAnchor="end" />
                      <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} tick={{ fontSize: 11, fill: '#475569' }} />
                      <Tooltip
                        formatter={(value: any, name: any) => [value, name === 'Score' ? 'Score de l\'élève' : 'Objectif']}
                        labelFormatter={(label, payload) => {
                          const item = payload?.[0]?.payload;
                          return item ? `${item.code} - ${item.title}` : label;
                        }}
                      />
                      <ReferenceLine y={3} stroke="#065F46" strokeDasharray="4 4" label={{ value: 'Objectif (3 pts)', fill: '#065F46', fontSize: 11, position: 'top' }} />
                      <Bar dataKey="Score" fill="#10B981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
