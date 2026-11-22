import React, { useState } from 'react';
import Papa from 'papaparse';
import { CurriculumItem } from '../../types';
import { X, Upload, Plus, Trash2, Edit2, Check, FileText, AlertCircle, Sparkles, Database } from 'lucide-react';

interface CurriculumSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  curriculumItems: CurriculumItem[];
  onSaveItem: (item: Partial<CurriculumItem>) => Promise<void>;
  onBulkSaveItems: (items: Partial<CurriculumItem>[]) => Promise<void>;
  onDeleteItem: (id: number) => Promise<void>;
  onClearItems?: () => Promise<void>;
}

export default function CurriculumSettingsModal({
  isOpen,
  onClose,
  curriculumItems,
  onSaveItem,
  onBulkSaveItems,
  onDeleteItem,
  onClearItems
}: CurriculumSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'import' | 'manage'>('import');
  
  // CSV Import state
  const [csvPreview, setCsvPreview] = useState<Partial<CurriculumItem>[]>([]);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSuccess, setImportSuccess] = useState<string>('');

  // Unitary Form state
  const [editingItem, setEditingItem] = useState<Partial<CurriculumItem> | null>(null);
  const [formData, setFormData] = useState<{
    id?: number;
    code: string;
    domain: string;
    subDomain: string;
    title: string;
    grade: string;
  }>({
    code: '',
    domain: '',
    subDomain: '',
    title: '',
    grade: 'CE1'
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);

  if (!isOpen) return null;

  // Handler d'analyse du fichier CSV
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    setImportSuccess('');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed: Partial<CurriculumItem>[] = [];

        results.data.forEach((row: any) => {
          // Gérer séparateurs et clés variées (Code/code, Domaine/domain, etc.)
          const code = row.Code || row.code || row['CODE'] || '';
          const domain = row.Domaine || row.domain || row['DOMAINE'] || '';
          const subDomain = row.SousDomaine || row['Sous-Domaine'] || row.subDomain || row['SOUS-DOMAINE'] || '';
          const title = row.Titre || row.title || row.Libelle || row['TITRE'] || '';
          const grade = row.Niveau || row.grade || row.Classe || row['NIVEAU'] || 'CE1';

          if (code && domain && title) {
            parsed.push({
              code: code.trim(),
              domain: domain.trim(),
              subDomain: subDomain.trim(),
              title: title.trim(),
              grade: grade.trim().toUpperCase()
            });
          }
        });

        setCsvPreview(parsed);
      },
      error: (err) => {
        console.error("Erreur lors de la lecture du CSV:", err);
      }
    });
  };

  const handleConfirmImport = async () => {
    if (csvPreview.length === 0) return;
    setIsImporting(true);
    try {
      await onBulkSaveItems(csvPreview);
      setImportSuccess(`${csvPreview.length} compétences importées avec succès !`);
      setCsvPreview([]);
      setCsvFileName('');
    } catch (e: any) {
      console.error("Erreur import:", e);
    } finally {
      setIsImporting(false);
    }
  };

  const handleSubmitUnitary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.domain || !formData.title || !formData.grade) return;

    setIsSaving(true);
    try {
      await onSaveItem({
        id: formData.id,
        code: formData.code.trim(),
        domain: formData.domain.trim(),
        subDomain: formData.subDomain.trim(),
        title: formData.title.trim(),
        grade: formData.grade.trim().toUpperCase()
      });
      // Réinitialiser formulaire
      setFormData({
        code: '',
        domain: '',
        subDomain: '',
        title: '',
        grade: 'CE1'
      });
      setEditingItem(null);
    } catch (e) {
      console.error("Erreur sauvegarde unitaire:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = (item: CurriculumItem) => {
    setEditingItem(item);
    setFormData({
      id: item.id,
      code: item.code,
      domain: item.domain,
      subDomain: item.subDomain || '',
      title: item.title,
      grade: item.grade
    });
    setActiveTab('manage');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modale */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Gestion du Curriculum & Compétences</h2>
              <p className="text-xs text-slate-500">Import CSV ou gestion unitaire des éléments du référentiel.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation des Onglets Internes */}
        <div className="px-6 pt-3 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('import')}
              className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
                activeTab === 'import'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Upload className="w-4 h-4" />
              Importation Massive (CSV)
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-2 ${
                activeTab === 'manage'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Plus className="w-4 h-4" />
              Référentiel ({curriculumItems.length} compétences)
            </button>
          </div>

          {onClearItems && curriculumItems.length > 0 && (
            <button
              onClick={async () => {
                if (confirm("Êtes-vous sûr de vouloir supprimer TOUTES les compétences du curriculum ? Cette action est irréversible.")) {
                  await onClearItems();
                }
              }}
              className="mb-2 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Vider le référentiel
            </button>
          )}
        </div>

        {/* Corps de la Modale */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'import' ? (
            <div className="space-y-6">
              {/* Formats de colonnes attendus */}
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4 text-xs text-indigo-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-950">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Format du fichier CSV attendu :
                </div>
                <p>
                  Le fichier CSV doit contenir les entêtes suivants (séparateur point-virgule <code className="bg-white px-1 py-0.5 rounded border border-indigo-200 font-mono text-[11px]">;</code> ou virgule) :
                </p>
                <div className="bg-white p-2.5 rounded-lg border border-indigo-200 font-mono text-[11px] text-indigo-800 overflow-x-auto">
                  Code;Domaine;SousDomaine;Titre;Niveau
                  <br />
                  NUM.01;Nombres et calculs;Dénombrement;Lire et écrire les nombres;CE1
                  <br />
                  FR.GRAM.02;Grammaire;La phrase;Identifier le sujet du verbe;CE2
                </div>
              </div>

              {/* Zone Upload */}
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-slate-50 transition cursor-pointer relative">
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 mx-auto flex items-center justify-center">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700">
                    {csvFileName ? `Fichier chargé : ${csvFileName}` : 'Glissez-déposez votre fichier CSV ou cliquez ici'}
                  </h3>
                  <p className="text-xs text-slate-400">Fichiers .csv encodés en UTF-8</p>
                </div>
              </div>

              {importSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs text-emerald-800 font-semibold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  {importSuccess}
                </div>
              )}

              {/* Aperçu des lignes Parsées */}
              {csvPreview.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Prévisualisation ({csvPreview.length} lignes)
                    </h4>
                    <button
                      onClick={handleConfirmImport}
                      disabled={isImporting}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2 disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      {isImporting ? 'Importation...' : 'Valider l\'importation'}
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 sticky top-0 font-bold text-slate-700">
                        <tr>
                          <th className="p-2 border-b border-slate-200">Code</th>
                          <th className="p-2 border-b border-slate-200">Domaine</th>
                          <th className="p-2 border-b border-slate-200">Sous-Domaine</th>
                          <th className="p-2 border-b border-slate-200">Titre</th>
                          <th className="p-2 border-b border-slate-200">Niveau</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {csvPreview.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 font-mono font-bold text-indigo-600">{item.code}</td>
                            <td className="p-2">{item.domain}</td>
                            <td className="p-2 text-slate-500">{item.subDomain || '-'}</td>
                            <td className="p-2 font-medium">{item.title}</td>
                            <td className="p-2 font-bold">{item.grade}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Formulaire d'Ajout / Édition Unitaire */}
              <form onSubmit={handleSubmitUnitary} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <span>{editingItem ? 'Éditer la compétence' : 'Ajouter une nouvelle compétence'}</span>
                  {editingItem && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(null);
                        setFormData({ code: '', domain: '', subDomain: '', title: '', grade: 'CE1' });
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 underline font-normal"
                    >
                      Annuler l'édition
                    </button>
                  )}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Code *</label>
                    <input
                      type="text"
                      placeholder="ex: NUM.01"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Domaine *</label>
                    <input
                      type="text"
                      placeholder="ex: Nombres et calculs"
                      value={formData.domain}
                      onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Sous-domaine</label>
                    <input
                      type="text"
                      placeholder="ex: Calcul mental"
                      value={formData.subDomain}
                      onChange={(e) => setFormData({ ...formData, subDomain: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Niveau *</label>
                    <select
                      value={formData.grade}
                      onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                      required
                    >
                      {['CP', 'CE1', 'CE2', 'CM1', 'CM2'].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Titre de la compétence *</label>
                  <input
                    type="text"
                    placeholder="ex: Résoudre des problèmes relevant de l'addition et de la soustraction."
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {isSaving ? 'Enregistrement...' : editingItem ? 'Mettre à jour' : 'Ajouter la compétence'}
                  </button>
                </div>
              </form>

              {/* Table des compétences existantes */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Compétences enregistrées ({curriculumItems.length})
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 sticky top-0 font-bold text-slate-700">
                      <tr>
                        <th className="p-2.5 border-b border-slate-200">Code</th>
                        <th className="p-2.5 border-b border-slate-200">Niveau</th>
                        <th className="p-2.5 border-b border-slate-200">Domaine</th>
                        <th className="p-2.5 border-b border-slate-200">Titre</th>
                        <th className="p-2.5 border-b border-slate-200 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {curriculumItems.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono font-bold text-indigo-600">{item.code}</td>
                          <td className="p-2.5 font-bold text-slate-700">{item.grade}</td>
                          <td className="p-2.5 text-slate-600">{item.domain}</td>
                          <td className="p-2.5 font-medium">{item.title}</td>
                          <td className="p-2.5 text-right space-x-1">
                            <button
                              onClick={() => handleEditClick(item)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
                              title="Modifier"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm(`Supprimer la compétence ${item.code} ?`)) {
                                  await onDeleteItem(item.id);
                                }
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
