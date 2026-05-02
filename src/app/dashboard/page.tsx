'use client'
import { useState, useEffect } from 'react'
import { neon } from '@neondatabase/serverless'

// Types pour TypeScript
interface Student {
  id: string;
  firstName: string;
  lastName: string;
  grade: string;
}

interface Competence {
  id: number;
  domain: string;
  subDomain: string;
  title: string;
}

export default function Dashboard() {
  const [students, setStudents] = useState<Student[]>([])
  const [competences, setCompetences] = useState<Competence[]>([])
  const [selectedDomain, setSelectedDomain] = useState('Français')
  const [loading, setLoading] = useState(true)

  const sql = neon("postgresql://neondb_owner:npg_H02jNElaQogn@ep-cold-truth-aljkhk6v.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require")

  // 1. Chargement des données
  useEffect(() => {
    async function loadData() {
      try {
        const resStudents = await sql`SELECT * FROM "Student" ORDER BY "lastName" ASC`
        const resComp = await sql`SELECT * FROM "Competence" ORDER BY id ASC`
        setStudents(resStudents as any)
        setCompetences(resComp as any)
      } catch (err) {
        console.error("Erreur de chargement:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // 2. Fonction de sauvegarde des résultats
  const saveResult = async (studentId: string, competenceId: number, score: number) => {
    try {
      await sql`
        INSERT INTO "Result" ("studentId", "competenceId", score)
        VALUES (${studentId}, ${competenceId}, ${score})
        ON CONFLICT ("studentId", "competenceId") 
        DO UPDATE SET score = ${score}, "updatedAt" = CURRENT_TIMESTAMP
      `
      console.log(`Enregistré : Elève ${studentId}, Notions ${competenceId}, Score ${score}`)
    } catch (err) {
      console.error("Erreur lors de la sauvegarde Neon:", err)
    }
  }

  // Filtrage des compétences selon le domaine choisi
  const filteredComp = competences.filter(c => c.subDomain === selectedDomain)

  if (loading) return <div style={{ padding: '50px', textAlign: 'center' }}>🚀 Préparation de la classe...</div>

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#f4f7f6', minHeight: '100vh' }}>
      <h1 style={{ color: '#333', marginBottom: '30px' }}>Suivi des Réussites</h1>

      {/* Menu de navigation (Onglets) */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px' }}>
        {['Français', 'Mathématiques', 'Arts', 'Éducation Physique', 'Questionner le Monde', 'Ens. Moral et Civique'].map(dom => (
          <button 
            key={dom}
            onClick={() => setSelectedDomain(dom)}
            style={{
              padding: '10px 25px',
              borderRadius: '25px',
              border: 'none',
              backgroundColor: selectedDomain === dom ? '#0070f3' : '#fff',
              color: selectedDomain === dom ? 'white' : '#666',
              boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
              cursor: 'pointer',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s'
            }}
          >
            {dom}
          </button>
        ))}
      </div>

      {/* Tableau Principal */}
      <div style={{ overflowX: 'auto', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', backgroundColor: 'white' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '20px', borderBottom: '2px solid #eee', textAlign: 'left', minWidth: '180px', position: 'sticky', left: 0, backgroundColor: '#f8f9fa', zIndex: 10 }}>Élève</th>
              {filteredComp.map(comp => (
                <th key={comp.id} style={{ padding: '15px', borderBottom: '2px solid #eee', borderLeft: '1px solid #f0f0f0', minWidth: '140px' }}>
                  <div style={{ fontSize: '11px', color: '#0070f3', textTransform: 'uppercase', letterSpacing: '1px' }}>{comp.title.split(':')[0]}</div>
                  <div style={{ fontSize: '13px', color: '#444', marginTop: '5px' }}>{comp.title.split(':')[1]}</div>
                  <div style={{ marginTop: '15px' }}>
                    <input type="checkbox" style={{ cursor: 'pointer' }} /> 
                    <span style={{ fontSize: '10px', marginLeft: '5px', color: '#888' }}>Démarrée</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map(student => (
              <tr key={student.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '15px', fontWeight: 'bold', position: 'sticky', left: 0, backgroundColor: 'white', borderRight: '2px solid #f0f0f0', zIndex: 5 }}>
                  {student.firstName} <span style={{ textTransform: 'uppercase' }}>{student.lastName}</span>
                </td>
                {filteredComp.map(comp => (
                  <td key={comp.id} style={{ padding: '15px', textAlign: 'center', borderLeft: '1px solid #f0f0f0' }}>
                    <select 
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        // Gestion visuelle des couleurs (Pitch: 5+ vert, 3-5 orange, <3 rouge)
                        let bg = '#fff', txt = '#333'
                        if (val >= 5) { bg = '#28a745'; txt = '#fff' }
                        else if (val >= 3) { bg = '#ffc107'; txt = '#333' }
                        else if (val > 0) { bg = '#dc3545'; txt = '#fff' }
                        
                        e.target.style.backgroundColor = bg
                        e.target.style.color = txt

                        // Sauvegarde dans Neon
                        saveResult(student.id, comp.id, val)
                      }}
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', fontWeight: 'bold', cursor: 'pointer', outline: 'none', transition: 'all 0.3s' }}
                    >
                      {[...Array(11)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}