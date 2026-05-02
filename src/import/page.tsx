'use client'
import { useState } from 'react'
import { neon } from '@neondatabase/serverless'

export default function AdminPage() {
  const [status, setStatus] = useState('')
  const sql = neon("postgresql://neondb_owner:npg_H02jNElaQogn@ep-cold-truth-aljkhk6v.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require")

  // --- 1. IMPORT DE LA PROGRESSION (VERSION TOTALE) ---
  const handleNotionFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setStatus('🚀 Analyse complète de la progression...')
    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      try {
        const lines = text.split('\n').filter(l => l.trim() !== '')
        const sep = lines[0].includes(';') ? ';' : ','
        const headers = lines[0].split(sep)
        
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(sep)
          for (let j = 0; j < headers.length; j++) {
            if (headers[j] && cols[j]) {
              const niveau = headers[j].trim() 
              // Découpage par tiret en nettoyant les espaces autour
              const parties = cols[j].split('-').map(p => p.trim()) 
              
              let matiereRaw = parties[0] || 'Inconnu'
              let categorieRaw = parties[1] || 'Général'
              
              // Le titre commence après la matière et la catégorie (index 2 et +)
              const titreDetail = parties.slice(2).join('-')
              const titreFinal = `${categorieRaw} : ${titreDetail}`

              // --- LE NETTOYEUR DE MATIÈRES (LA TOTALE) ---
              let matiereLabel = matiereRaw
              const m = matiereRaw.toUpperCase()

              if (m === 'FRA') matiereLabel = 'Français'
              else if (m === 'MATHS') matiereLabel = 'Mathématiques'
              else if (m === 'ARTS' || m === 'ART') matiereLabel = 'Arts'
              else if (m === 'EPS') matiereLabel = 'Éducation Physique'
              else if (m === 'QLM') matiereLabel = 'Questionner le Monde'
              else if (m === 'EMC') matiereLabel = 'Ens. Moral et Civique'
              else if (m === 'ANGLAIS') matiereLabel = 'Anglais'

              await sql`
                INSERT INTO "Competence" (domain, "subDomain", title) 
                VALUES (${niveau}, ${matiereLabel}, ${titreFinal})
              `
            }
          }
        }
        setStatus('✅ Progression complète importée !')
      } catch (err) { 
        console.error(err)
        setStatus('❌ Erreur lors de l\'import') 
      }
    }
    reader.readAsText(file)
  }

  // --- 2. IMPORT DE LA LISTE ÉLÈVES ---
  const handleStudentFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setStatus('🚀 Importation des élèves...')
    const reader = new FileReader()
    reader.onload = async (event) => {
      const text = event.target?.result as string
      try {
        const lines = text.split('\n').filter(l => l.trim() !== '')
        for (let i = 0; i < lines.length; i++) {
          const cols = lines[i].split(';') 
          if (cols.length >= 2) {
            await sql`
              INSERT INTO "Student" (id, "firstName", "lastName", grade, level) 
              VALUES (gen_random_uuid(), ${cols[0].trim()}, ${cols[1].trim()}, ${cols[2] ? cols[2].trim() : 'Classe'}, ${cols[3] ? cols[3].trim() : ''})
            `
          }
        }
        setStatus('✅ Liste des élèves importée !')
      } catch (err) { setStatus('❌ Erreur élèves') }
    }
    reader.readAsText(file)
  }

  // --- 3. RÉINITIALISATION ---
  const handleReset = async () => {
    if (!confirm("⚠️ Tout effacer pour recommencer à zéro ?")) return
    setStatus('🧹 Nettoyage complet...')
    try {
      await sql`TRUNCATE TABLE "Result", "Fluence", "Student", "Competence" RESTART IDENTITY CASCADE`
      setStatus('✨ Système réinitialisé !')
    } catch (err) { setStatus('❌ Erreur reset') }
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '700px', margin: 'auto', backgroundColor: '#fff', borderRadius: '15px', marginTop: '50px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
      <h1 style={{ textAlign: 'center', color: '#1a1a1a', marginBottom: '40px' }}>Administration Classe</h1>
      
      <div style={{ padding: '25px', border: '1px solid #eee', borderRadius: '12px', marginBottom: '20px', backgroundColor: '#fafafa' }}>
        <h3 style={{ marginTop: 0 }}>1. Importer la Progression</h3>
        <p style={{ fontSize: '13px', color: '#666' }}>Gère : FRA, MATHS, ARTS, EPS, QLM, EMC, ANGLAIS</p>
        <input type="file" accept=".csv" onChange={handleNotionFile} />
      </div>

      <div style={{ padding: '25px', border: '1px solid #eee', borderRadius: '12px', marginBottom: '30px', backgroundColor: '#fafafa' }}>
        <h3 style={{ marginTop: 0 }}>2. Importer la Liste des Élèves</h3>
        <input type="file" accept=".csv" onChange={handleStudentFile} />
      </div>

      <button onClick={handleReset} style={{ width: '100%', padding: '14px', background: '#ff4d4d', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
        🗑️ Réinitialiser tout
      </button>

      {status && (
        <div style={{ marginTop: '25px', padding: '15px', borderRadius: '8px', backgroundColor: '#e7f3ff', color: '#0070f3', textAlign: 'center', fontWeight: 'bold' }}>
          {status}
        </div>
      )}
    </div>
  )
}