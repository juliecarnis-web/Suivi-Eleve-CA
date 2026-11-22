import React, { useState, useEffect } from 'react';
import { X, Save, Sliders, CheckCircle2 } from 'lucide-react';
import { FluenceReference } from '../../types';

interface FluenceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  fluenceReferences: FluenceReference[];
  onSaveReferences: (newRefs: FluenceReference[]) => Promise<void>;
}

const GRADES = ['CP', 'CE1', 'CE2', 'CM1', 'CM2'];
const PERIODS = [1, 2, 3, 4, 5];

export default function FluenceSettingsModal({
  isOpen,
  onClose,
  fluenceReferences,
  onSaveReferences
}: FluenceSettingsModalProps) {
  const [localRefs, setLocalRefs] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    GRADES.forEach(g => {
      PERIODS.forEach(p => {
        const found = fluenceReferences.find(r => r.grade === g && Number(r.period) === p);
        map[`${g}_P${p}`] = found ? Number(found.target_score) : 50;
      });
    });
    return map;
  });

  useEffect(() => {
    if (isOpen) {
      const map: Record<string, number> = {};
      GRADES.forEach(g => {
        PERIODS.forEach(p => {
          const found = fluenceReferences.find(r => r.grade === g && Number(r.period) === p);
          map[`${g}_P${p}`] = found ? Number(found.target_score) : 50;
        });
      });
      setLocalRefs(map);
    }
  }, [isOpen, fluenceReferences]);

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  if (!isOpen) return null;

  const handleChange = (grade: string, period: number, val: number) => {
    setLocalRefs(prev => ({
      ...prev,
      [`${grade}_P${period}`]: val
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const listToSave: FluenceReference[] = [];
      GRADES.forEach(g => {
        PERIODS.forEach(p => {
          const key = `${g}_P${p}`;
          listToSave.push({
            id: key,
            grade: g,
            period: p,
            target_score: localRefs[key] || 0
          });
        });
      });

      await onSaveReferences(listToSave);
      setSuccessMsg(true);
      setTimeout(() => {
        setSuccessMsg(false);
        onClose();
      }, 1000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 bg-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-200" />
            <h3 className="font-bold text-base">Seuils de Référence Fluence (MCLM attendus)</h3>
          </div>
          <button
            onClick={onClose}
            className="text-indigo-200 hover:text-white transition p-1 rounded-lg hover:bg-indigo-600/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <p className="text-xs text-slate-600">
            Définissez les objectifs en nombre de mots correctement lus par minute (MCLM) visés pour chaque niveau et chaque période de l'année.
          </p>

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Seuils de référence enregistrés avec succès !
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-xs font-bold">
                  <th className="p-3">Niveau</th>
                  {PERIODS.map(p => (
                    <th key={p} className="p-3 text-center">Période {p}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {GRADES.map(grade => (
                  <tr key={grade} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-800 bg-slate-50/50">{grade}</td>
                    {PERIODS.map(period => {
                      const key = `${grade}_P${period}`;
                      const val = localRefs[key] ?? 0;
                      return (
                        <td key={period} className="p-2 text-center">
                          <input
                            type="number"
                            min="0"
                            max="300"
                            value={val}
                            onChange={(e) => handleChange(grade, period, parseInt(e.target.value || '0', 10))}
                            className="w-16 px-2 py-1 text-center font-semibold border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 text-sm"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Enregistrement...' : 'Enregistrer les seuils'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
