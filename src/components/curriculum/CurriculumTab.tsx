import React, { useState } from 'react';
import { Student, CurriculumItem, CurriculumResult } from '../../types';
import CurriculumSaisieGrid from './CurriculumSaisieGrid';
import CurriculumCharts from './CurriculumCharts';
import CurriculumSettingsModal from './CurriculumSettingsModal';
import { Layers, Sliders, Lock, Unlock, BarChart3, Edit3, Sparkles } from 'lucide-react';

interface CurriculumTabProps {
  students: Student[];
  curriculumItems: CurriculumItem[];
  curriculumResults: CurriculumResult[];
  isEditMode: boolean;
  handleToggleEditMode?: () => void;
  onSaveCurriculumResult: (result: {
    studentId: string;
    curriculumId: number;
    evaluationNum: number;
    score: number | null;
    grade: string;
  }) => Promise<void>;
  onSaveCurriculumItem: (item: Partial<CurriculumItem>) => Promise<void>;
  onBulkSaveCurriculumItems: (items: Partial<CurriculumItem>[]) => Promise<void>;
  onDeleteCurriculumItem: (id: number) => Promise<void>;
  onClearCurriculumItems?: () => Promise<void>;
}

export default function CurriculumTab({
  students,
  curriculumItems,
  curriculumResults,
  isEditMode,
  handleToggleEditMode,
  onSaveCurriculumResult,
  onSaveCurriculumItem,
  onBulkSaveCurriculumItems,
  onDeleteCurriculumItem,
  onClearCurriculumItems
}: CurriculumTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'grid' | 'charts'>('grid');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* En-tête de section et barre d'outils */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Cahier de Curriculum & Compétences</h1>
            <p className="text-xs text-slate-500">
              Système de points cumulatifs par élève (de 0 à 3 points par compétence).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Bouton d'activation du Mode Saisie */}
          {handleToggleEditMode && (
            <button
              onClick={handleToggleEditMode}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition border shadow-xs ${
                isEditMode
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {isEditMode ? (
                <>
                  <Unlock className="w-4 h-4 text-emerald-600" />
                  Mode Saisie Actif
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-slate-500" />
                  Activer la Saisie
                </>
              )}
            </button>
          )}

          {/* Bouton Paramètres / Import CSV */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition shadow-xs"
          >
            <Sliders className="w-4 h-4" />
            Référentiel & CSV
          </button>
        </div>
      </div>

      {/* Navigation entre Saisie et Graphiques */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-1">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSubTab('grid')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-bold transition border-b-2 ${
              activeSubTab === 'grid'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Edit3 className="w-4 h-4" />
            Saisie des Points
          </button>
          <button
            onClick={() => setActiveSubTab('charts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-xs font-bold transition border-b-2 ${
              activeSubTab === 'charts'
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Analyse & Graphiques
          </button>
        </div>
      </div>

      {/* Vue active */}
      {activeSubTab === 'grid' ? (
        <CurriculumSaisieGrid
          students={students}
          curriculumItems={curriculumItems}
          curriculumResults={curriculumResults}
          selectedGrade={selectedGrade}
          setSelectedGrade={setSelectedGrade}
          isEditMode={isEditMode}
          onSaveResult={onSaveCurriculumResult}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      ) : (
        <CurriculumCharts
          students={students}
          curriculumItems={curriculumItems}
          curriculumResults={curriculumResults}
          selectedGrade={selectedGrade}
        />
      )}

      {/* Modale de gestion et d'importation CSV */}
      <CurriculumSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        curriculumItems={curriculumItems}
        onSaveItem={onSaveCurriculumItem}
        onBulkSaveItems={onBulkSaveCurriculumItems}
        onDeleteItem={onDeleteCurriculumItem}
        onClearItems={onClearCurriculumItems}
      />
    </div>
  );
}
