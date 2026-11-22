import React from 'react';
import { Activity, Target, TrendingUp, AlertTriangle } from 'lucide-react';
import { Student, FluenceScore, FluenceReference } from '../../types';

interface FluenceStatsHeaderProps {
  students: Student[];
  fluenceScores: FluenceScore[];
  fluenceReferences: FluenceReference[];
  selectedPeriod: number;
  selectedGrade: string;
}

export default function FluenceStatsHeader({
  students,
  fluenceScores,
  fluenceReferences,
  selectedPeriod,
  selectedGrade
}: FluenceStatsHeaderProps) {
  // Filtrer les élèves selon le niveau sélectionné (actif)
  const filteredStudents = students.filter(s => !s.isArchived && (selectedGrade === 'all' || s.grade === selectedGrade));
  const studentIds = new Set(filteredStudents.map(s => s.id));

  // Scores enregistrés pour la période et la cohorte sélectionnée
  const periodScores = fluenceScores.filter(s => s.period === selectedPeriod && studentIds.has(s.studentId));
  
  const evaluatedCount = periodScores.length;
  const totalStudents = filteredStudents.length;

  // Calcul de la moyenne MCLM
  const totalMclm = periodScores.reduce((acc, curr) => acc + (curr.score || 0), 0);
  const avgMclm = evaluatedCount > 0 ? Math.round(totalMclm / evaluatedCount) : 0;

  // Calcul du taux d'atteinte de l'objectif
  let onTargetCount = 0;
  let belowTargetCount = 0;

  periodScores.forEach(s => {
    const student = filteredStudents.find(st => st.id === s.studentId);
    if (student) {
      const ref = fluenceReferences.find(r => r.grade === student.grade && r.period === selectedPeriod);
      const target = ref?.target_score || 0;
      if (s.score >= target) {
        onTargetCount++;
      } else {
        belowTargetCount++;
      }
    }
  });

  const successPercentage = evaluatedCount > 0 ? Math.round((onTargetCount / evaluatedCount) * 100) : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Evalués / Effectif */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Couverture Période {selectedPeriod}</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-slate-800">{evaluatedCount}</span>
            <span className="text-xs font-medium text-slate-500">/ {totalStudents} élèves</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
          <Activity className="w-5 h-5" />
        </div>
      </div>

      {/* 2. Moyenne MCLM */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Moyenne Classe</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-indigo-600">{avgMclm}</span>
            <span className="text-xs font-medium text-slate-500">mots / min</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
          <TrendingUp className="w-5 h-5" />
        </div>
      </div>

      {/* 3. Objectif Atteint */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Objectif Atteint</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-emerald-600">{successPercentage}%</span>
            <span className="text-xs font-medium text-slate-500">({onTargetCount} élèves)</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
          <Target className="w-5 h-5" />
        </div>
      </div>

      {/* 4. Aides et Remédiation */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Besoin de Soutien</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-rose-600">{belowTargetCount}</span>
            <span className="text-xs font-medium text-slate-500">élève(s) sous le seuil</span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
          <AlertTriangle className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
