import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import { Student, FluenceScore, FluenceReference } from '../../types';
import { User, BarChart3, LineChart as LineChartIcon, Target } from 'lucide-react';

interface FluenceChartsProps {
  students: Student[];
  fluenceScores: FluenceScore[];
  fluenceReferences: FluenceReference[];
  selectedPeriod: number;
  selectedGrade: string;
}

export default function FluenceCharts({
  students,
  fluenceScores,
  fluenceReferences,
  selectedPeriod,
  selectedGrade
}: FluenceChartsProps) {
  const activeStudents = students.filter(s => !s.isArchived && (selectedGrade === 'all' || s.grade === selectedGrade));
  
  const [selectedStudentId, setSelectedStudentId] = useState<string>(activeStudents[0]?.id || '');
  const [chartView, setChartView] = useState<'individual' | 'class'>('class');

  const selectedStudent = activeStudents.find(s => s.id === selectedStudentId) || activeStudents[0];

  // 1. Calcul dynamique des bornes globale de l'axe Y (ordonnées)
  const refScores = fluenceReferences
    .map(r => Number(r.target_score))
    .filter(val => !isNaN(val) && val > 0);

  const studentScores = fluenceScores
    .map(s => Number(s.score))
    .filter(val => !isNaN(val) && val > 0);

  const minRef = refScores.length > 0 ? Math.min(...refScores) : 15;
  const maxRef = refScores.length > 0 ? Math.max(...refScores) : 120;
  const maxRecorded = studentScores.length > 0 ? Math.max(...studentScores) : 0;

  // Borne min : arrondie au multiple de 10 inférieur (ex: min 15 MCLM -> 10, min 0 -> 0)
  const yMin = Math.max(0, Math.floor((minRef - 5) / 10) * 10);
  
  // Borne max : prend le max entre le seuil le plus élevé connu (ex: CM2 P5) et les scores élèves, arrondi au multiple supérieur
  const yMax = Math.ceil((Math.max(maxRef, maxRecorded) + 10) / 10) * 10;

  // 2. Données pour le graphique individuel (P1 à P5)
  const periods = [1, 2, 3, 4, 5];
  const individualData = periods.map(p => {
    const scoreObj = fluenceScores.find(
      s => (s.studentId === selectedStudent?.id || (s as any).studentid === selectedStudent?.id) && Number(s.period) === Number(p)
    );
    const targetRef = fluenceReferences.find(
      r => r.grade === selectedStudent?.grade && Number(r.period) === Number(p)
    );
    return {
      period: `Période ${p}`,
      score: scoreObj ? Number(scoreObj.score) : null,
      target: targetRef ? Number(targetRef.target_score) : null,
      errors: scoreObj ? Number(scoreObj.errors_count) : 0
    };
  });

  // 3. Données pour la vue de classe (Période sélectionnée)
  const classData = activeStudents.map(student => {
    const scoreObj = fluenceScores.find(
      s => (s.studentId === student.id || (s as any).studentid === student.id) && Number(s.period) === Number(selectedPeriod)
    );
    const targetRef = fluenceReferences.find(
      r => r.grade === student.grade && Number(r.period) === Number(selectedPeriod)
    );
    return {
      name: `${student.firstName} ${student.lastName.charAt(0)}.`,
      score: scoreObj ? Number(scoreObj.score) : 0,
      target: targetRef ? Number(targetRef.target_score) : 50,
      grade: student.grade
    };
  });

  // Seuil d'objectif dynamique pour la vue classe
  const currentGradeTarget = (() => {
    if (selectedGrade !== 'all') {
      const found = fluenceReferences.find(r => r.grade === selectedGrade && Number(r.period) === Number(selectedPeriod));
      if (found) return Number(found.target_score);
    }
    const targets = classData.map(d => d.target).filter(t => t > 0);
    if (targets.length > 0) {
      return Math.round(targets.reduce((a, b) => a + b, 0) / targets.length);
    }
    return 50;
  })();

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            Visualisations & Analyse de la Fluence
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Suivi individuel et positionnement de la classe par rapport aux seuils de référence ({yMin} à {yMax} MCLM).
          </p>
        </div>

        {/* Boutons de bascule de vue */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setChartView('class')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              chartView === 'class'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Vue Classe
          </button>
          <button
            onClick={() => setChartView('individual')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              chartView === 'individual'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LineChartIcon className="w-4 h-4" />
            Profil Élève
          </button>
        </div>
      </div>

      {/* --- GRAPHIQUE 1 : VUE CLASSE --- */}
      {chartView === 'class' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4 text-xs font-semibold text-slate-600">
            <span>Score MCLM des élèves pour la <strong>Période {selectedPeriod}</strong></span>
            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5 font-semibold">
              <Target className="w-3.5 h-3.5 text-emerald-600" />
              <span>Seuil d'objectif {selectedGrade !== 'all' ? selectedGrade : 'moyen'} P{selectedPeriod} :</span>
              <strong className="text-emerald-800">{currentGradeTarget} MCLM</strong>
            </span>
          </div>

          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={classData} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis
                  domain={[yMin, yMax]}
                  label={{ value: 'Mots / min (MCLM)', angle: -90, position: 'insideLeft', fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: any, name: string) => [
                    `${value} MCLM`,
                    name === 'Score Élève (MCLM)' ? 'Score Élève' : 'Seuil Objectif'
                  ]}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1' }}
                />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="score" fill="#6366F1" radius={[4, 4, 0, 0]} name="Score Élève (MCLM)" />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Seuil Objectif (MCLM)"
                  stroke="#10B981"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 4, fill: '#10B981' }}
                />
                <ReferenceLine
                  y={currentGradeTarget}
                  stroke="#059669"
                  strokeDasharray="5 5"
                  label={{ value: `Objectif (${currentGradeTarget} MCLM)`, fill: '#059669', fontSize: 11, position: 'top' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* --- GRAPHIQUE 2 : PROFIL ÉLÈVE INDIVIDUEL --- */}
      {chartView === 'individual' && (
        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-600" />
              <label className="text-xs font-bold text-slate-700">Sélectionner un élève :</label>
            </div>
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-md bg-white text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {activeStudents.map(s => (
                <option key={s.id} value={s.id}>
                  {s.lastName} {s.firstName} ({s.grade})
                </option>
              ))}
            </select>
          </div>

          {selectedStudent ? (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={individualData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="period" tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis
                    domain={[yMin, yMax]}
                    label={{ value: 'Mots / min (MCLM)', angle: -90, position: 'insideLeft', fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1' }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Line
                    type="monotone"
                    dataKey="score"
                    name={`Score de ${selectedStudent.firstName} (MCLM)`}
                    stroke="#4F46E5"
                    strokeWidth={3}
                    dot={{ r: 5, fill: '#4F46E5' }}
                    activeDot={{ r: 7 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    name={`Seuil visé (${selectedStudent.grade})`}
                    stroke="#10B981"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ r: 4, fill: '#10B981' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-8">Aucun élève sélectionné.</p>
          )}
        </div>
      )}
    </div>
  );
}
