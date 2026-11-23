import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Competence } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getScoreColor(score: number | null | undefined, isStarted: boolean) {
  if (!isStarted || score === null || score === undefined) return 'bg-slate-100 text-slate-400 border-slate-200';
  if (score >= 5) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (score >= 3 && score <= 4) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

export const scaleScore = (val: number) => val <= 5 ? (val * 1.6) : (8 + (val - 5) * 0.4);

export const getCode = (c: Competence) => c.code || c.title.split(' : ')[0] || '';
export const getGrade = (c: Competence) => c.grade || c.domain || '';
export const getDomain = (c: Competence) => c.domain || '';

export function getDomainFrequencies(competences: Competence[]) {
  const freqs: Record<string, number> = {};
  competences.forEach(c => {
    const d = getDomain(c);
    if (d) freqs[d] = (freqs[d] || 0) + 1;
  });
  return freqs;
}

export function createDomainSorter(competences: Competence[]) {
  const freqs = getDomainFrequencies(competences);
  return (a: string, b: string) => {
    const freqA = freqs[a] || 0;
    const freqB = freqs[b] || 0;
    if (freqA !== freqB) {
      return freqB - freqA; // descending
    }
    return a.localeCompare(b, undefined, { numeric: true });
  };
}
