'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'

type Reflection = {
  technician_id?: string | null
  technician_name: string
  job_type: string
  challenge: string
  what_went_well: string | null
  help_needed: string | null
  ai_response: string | null
  manager_insight: string | null
  created_at: string
}

type VoiceField =
  | 'technicianName'
  | 'jobType'
  | 'challenge'
  | 'whatWentWell'
  | 'helpNeeded'

type GuidedStep = VoiceField | null

type ManagerNoteRow = {
  technician_name: string
  note: string | null
  updated_at: string | null
}

type Technician = {
  id: string
  canonical_name: string
}

type TechnicianAliasRow = {
  technician_id: string
  alias: string
}

type BurnoutSignalLevel = 'Low' | 'Moderate' | 'High'

type BurnoutSignal = {
  technicianName: string
  score: number
  level: BurnoutSignalLevel
  summary: string
  managerAction: string
  weeklyReflectionCount: number
  pressureMentions: number
  supportMentions: number
  positiveMentions: number
  heavyJobMixCount: number
  latestEntry: string | null
}

const JOB_TYPE_OPTIONS = [
  'Service Call',
  'Installation',
  'Callback',
  'Maintenance',
  'Inspection',
  'Warranty',
  'Estimate',
  'Emergency Call',
  'Other',
]

const BURNOUT_PRESSURE_KEYWORDS = [
  'rushed',
  'rush',
  'pressure',
  'behind',
  'late',
  'overtime',
  'fatigue',
  'tired',
  'exhausted',
  'frustrated',
  'stress',
  'stressed',
  'overwhelmed',
  'too much',
  'missed',
  'family',
  'baseball',
  'practice',
  'long day',
  'long install',
  'after hours',
  'waiting',
  'delay',
  'delayed',
  'customer upset',
  'upset',
]

const BURNOUT_SUPPORT_KEYWORDS = [
  'help',
  'support',
  'training',
  'unsure',
  'unclear',
  'miscommunication',
  'did not know',
  "didn't know",
  'parts',
  'material',
  'truck stock',
  'schedule',
  'scheduling',
  'communication',
  'prep',
  'prepared',
]

const POSITIVE_SIGNAL_KEYWORDS = [
  'finished',
  'completed',
  'solved',
  'customer happy',
  'happy',
  'teamwork',
  'worked together',
  'learned',
  'confident',
  'smooth',
  'success',
  'grateful',
  'good job',
  'went well',
]

export default function Home() {
  const [view, setView] = useState<'tech' | 'manager'>('tech')
  const [managerScreen, setManagerScreen] = useState<'dashboard' | 'directory' | 'profile'>(
    'dashboard'
  )
  const [selectedTechnician, setSelectedTechnician] = useState<string | null>(null)

  const [technicianName, setTechnicianName] = useState('')
  const [jobType, setJobType] = useState('')
  const [challenge, setChallenge] = useState('')
  const [whatWentWell, setWhatWentWell] = useState('')
  const [helpNeeded, setHelpNeeded] = useState('')
  const [message, setMessage] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [loading, setLoading] = useState(false)

  const [reflections, setReflections] = useState<Reflection[]>([])
  const [loadingReflections, setLoadingReflections] = useState(false)
  const [managerError, setManagerError] = useState('')

  const [managerNotes, setManagerNotes] = useState<Record<string, ManagerNoteRow>>({})
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [technicianAliasMap, setTechnicianAliasMap] = useState<
    Record<string, { technicianId: string; canonicalName: string }>
  >({})
  const [managerNoteText, setManagerNoteText] = useState('')
  const [managerNoteMessage, setManagerNoteMessage] = useState('')
  const [savingManagerNote, setSavingManagerNote] = useState(false)

  const [isListening, setIsListening] = useState(false)
  const [activeField, setActiveField] = useState<VoiceField | null>(null)
  const [speechSupported, setSpeechSupported] = useState(false)

  const [guidedRecording, setGuidedRecording] = useState(false)
  const [guidedStep, setGuidedStep] = useState<GuidedStep>(null)
  const [guidedPrompt, setGuidedPrompt] = useState('')

  const recognitionRef = useRef<any>(null)
  const guidedModeRef = useRef(false)
  const clearMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const normalizeAliasKey = (value: string) => value.trim().toLowerCase()

  const normalizeJobType = (spokenValue: string) => {
    const value = spokenValue.toLowerCase().trim()

    if (value.includes('service') || value.includes('service call') || value.includes('repair')) {
      return 'Service Call'
    }

    if (value.includes('install') || value.includes('installation') || value.includes('new install')) {
      return 'Installation'
    }

    if (value.includes('callback') || value.includes('call back') || value.includes('went back')) {
      return 'Callback'
    }

    if (value.includes('maintenance') || value.includes('maint')) {
      return 'Maintenance'
    }

    if (value.includes('inspection') || value.includes('inspect')) {
      return 'Inspection'
    }

    if (value.includes('warranty')) {
      return 'Warranty'
    }

    if (value.includes('estimate') || value.includes('quote') || value.includes('bid')) {
      return 'Estimate'
    }

    if (value.includes('emergency') || value.includes('after hours') || value.includes('urgent')) {
      return 'Emergency Call'
    }

    return 'Other'
  }

  const buildTechnicianAliasMap = (
    techniciansList: Technician[],
    aliasesList: TechnicianAliasRow[]
  ) => {
    const techById = new Map(techniciansList.map((t) => [t.id, t]))

    const map: Record<string, { technicianId: string; canonicalName: string }> = {}

    techniciansList.forEach((tech) => {
      map[normalizeAliasKey(tech.canonical_name)] = {
        technicianId: tech.id,
        canonicalName: tech.canonical_name,
      }
    })

    aliasesList.forEach((aliasRow) => {
      const tech = techById.get(aliasRow.technician_id)
      if (!tech) return

      map[normalizeAliasKey(aliasRow.alias)] = {
        technicianId: tech.id,
        canonicalName: tech.canonical_name,
      }
    })

    return map
  }

  const fetchTechnicianIdentityData = async () => {
    const { data: techData, error: techError } = await supabase
      .from('Technicians')
      .select('id, canonical_name')
      .order('canonical_name', { ascending: true })

    if (techError) {
      console.log('Supabase technicians fetch error:', JSON.stringify(techError, null, 2))
      return
    }

    const { data: aliasData, error: aliasError } = await supabase
      .from('TechnicianAliases')
      .select('technician_id, alias')

    if (aliasError) {
      console.log('Supabase technician aliases fetch error:', JSON.stringify(aliasError, null, 2))
      return
    }

    const techniciansList = (techData || []) as Technician[]
    const aliasesList = (aliasData || []) as TechnicianAliasRow[]

    setTechnicians(techniciansList)
    setTechnicianAliasMap(buildTechnicianAliasMap(techniciansList, aliasesList))
  }

  const resolveTechnicianIdentity = async (rawName: string) => {
    const normalized = normalizeAliasKey(rawName)
    const existing = technicianAliasMap[normalized]

    if (existing) {
      return existing
    }

    const canonicalName = rawName.trim()

    const { data: insertedTech, error: techInsertError } = await supabase
      .from('Technicians')
      .upsert([{ canonical_name: canonicalName }], { onConflict: 'canonical_name' })
      .select('id, canonical_name')
      .single()

    if (techInsertError || !insertedTech) {
      throw new Error(techInsertError?.message || 'Unable to resolve technician.')
    }

    const technicianRecord = insertedTech as Technician

    const { error: aliasInsertError } = await supabase
      .from('TechnicianAliases')
      .upsert(
        [
          {
            technician_id: technicianRecord.id,
            alias: canonicalName,
          },
        ],
        { onConflict: 'alias' }
      )

    if (aliasInsertError) {
      throw new Error(aliasInsertError.message)
    }

    const resolved = {
      technicianId: technicianRecord.id,
      canonicalName: technicianRecord.canonical_name,
    }

    setTechnicianAliasMap((prev) => ({
      ...prev,
      [normalized]: resolved,
      [normalizeAliasKey(technicianRecord.canonical_name)]: resolved,
    }))

    setTechnicians((prev) => {
      const alreadyExists = prev.some((t) => t.id === technicianRecord.id)
      return alreadyExists ? prev : [...prev, technicianRecord].sort((a, b) =>
        a.canonical_name.localeCompare(b.canonical_name)
      )
    })

    return resolved
  }

  const speakPrompt = (text: string, onDone?: () => void) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onDone?.()
      return
    }

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1
    utterance.pitch = 1
    utterance.onend = () => onDone?.()
    utterance.onerror = () => onDone?.()

    window.speechSynthesis.speak(utterance)
  }

  const setFieldValue = (field: VoiceField, value: string) => {
    if (field === 'technicianName') setTechnicianName(value.trim())
    if (field === 'jobType') setJobType(normalizeJobType(value))
    if (field === 'challenge') setChallenge(value.trim())
    if (field === 'whatWentWell') setWhatWentWell(value.trim())
    if (field === 'helpNeeded') setHelpNeeded(value.trim())
  }

  const appendFieldValue = (field: VoiceField, value: string) => {
    const cleanValue = value.trim()
    if (!cleanValue) return

    if (field === 'technicianName') {
      setTechnicianName(cleanValue)
      return
    }

    if (field === 'jobType') {
      setJobType(normalizeJobType(cleanValue))
      return
    }

    if (field === 'challenge') {
      setChallenge((prev) => (prev ? `${prev} ${cleanValue}` : cleanValue))
    }

    if (field === 'whatWentWell') {
      setWhatWentWell((prev) => (prev ? `${prev} ${cleanValue}` : cleanValue))
    }

    if (field === 'helpNeeded') {
      setHelpNeeded((prev) => (prev ? `${prev} ${cleanValue}` : cleanValue))
    }
  }

  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
    }
  }

  const resetGuidedRecording = () => {
    guidedModeRef.current = false
    setGuidedRecording(false)
    setGuidedStep(null)
    setGuidedPrompt('')
    setIsListening(false)
    setActiveField(null)
  }

  const moveToNextGuidedStep = (completedField: VoiceField) => {
    if (!guidedModeRef.current) return

    if (completedField === 'technicianName') {
      const nextPrompt =
        'Next question. What type of job was this? You can say service call, installation, callback, maintenance, inspection, warranty, estimate, emergency call, or other.'
      setGuidedStep('jobType')
      setGuidedPrompt(nextPrompt)

      speakPrompt(nextPrompt, () => {
        if (guidedModeRef.current) {
          startRecognitionForField('jobType', false)
        }
      })
      return
    }

    if (completedField === 'jobType') {
      const nextPrompt = 'Tell me about the job and any challenges you faced.'
      setGuidedStep('challenge')
      setGuidedPrompt(nextPrompt)

      speakPrompt(nextPrompt, () => {
        if (guidedModeRef.current) {
          startRecognitionForField('challenge', false)
        }
      })
      return
    }

    if (completedField === 'challenge') {
      const nextPrompt = 'What went well?'
      setGuidedStep('whatWentWell')
      setGuidedPrompt(nextPrompt)

      speakPrompt(nextPrompt, () => {
        if (guidedModeRef.current) {
          startRecognitionForField('whatWentWell', false)
        }
      })
      return
    }

    if (completedField === 'whatWentWell') {
      const nextPrompt = 'What would have helped?'
      setGuidedStep('helpNeeded')
      setGuidedPrompt(nextPrompt)

      speakPrompt(nextPrompt, () => {
        if (guidedModeRef.current) {
          startRecognitionForField('helpNeeded', false)
        }
      })
      return
    }

    if (completedField === 'helpNeeded') {
      const donePrompt = 'Reflection recording complete.'
      setGuidedPrompt(donePrompt)
      speakPrompt(donePrompt)
      resetGuidedRecording()
    }
  }

  const startRecognitionForField = (field: VoiceField, append = false) => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

    if (!SpeechRecognition) {
      alert('Speech-to-text is not supported in this browser. Try Chrome.')
      return
    }

    stopRecognition()

    const recognition = new SpeechRecognition()
    recognitionRef.current = recognition

    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    setIsListening(true)
    setActiveField(field)

    recognition.onresult = (event: any) => {
      let transcript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }

      if (append) {
        appendFieldValue(field, transcript)
      } else {
        setFieldValue(field, transcript)
      }
    }

    recognition.onerror = () => {
      setIsListening(false)
      setActiveField(null)

      if (guidedModeRef.current) {
        moveToNextGuidedStep(field)
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      setActiveField(null)

      if (guidedModeRef.current) {
        moveToNextGuidedStep(field)
      }
    }

    recognition.start()
  }

  const startListening = (field: VoiceField) => {
    guidedModeRef.current = false
    setGuidedRecording(false)
    setGuidedStep(null)
    setGuidedPrompt('')
    startRecognitionForField(field, false)
  }

  const startFullReflectionRecording = () => {
    if (!speechSupported) {
      alert('Speech-to-text is not supported in this browser. Try Chrome.')
      return
    }

    guidedModeRef.current = true
    setGuidedRecording(true)
    setGuidedStep('technicianName')

    const firstPrompt = 'First question. What is your name?'
    setGuidedPrompt(firstPrompt)

    speakPrompt(firstPrompt, () => {
      if (guidedModeRef.current) {
        startRecognitionForField('technicianName', false)
      }
    })
  }

  const cancelFullReflectionRecording = () => {
    stopRecognition()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    resetGuidedRecording()
  }

  const buildManagerInsight = (
    jobTypeValue: string,
    challengeValue: string,
    whatWentWellValue: string,
    helpNeededValue: string
  ) => {
    const challengeText = `${challengeValue} ${helpNeededValue}`.toLowerCase()
    const winText = `${whatWentWellValue}`.toLowerCase()

    let concernScore = 0
    let positiveScore = 0

    const detectedConcerns: string[] = []
    const detectedPositives: string[] = []
    const suggestedActions: string[] = []

    if (
      challengeText.includes('part') ||
      challengeText.includes('parts') ||
      challengeText.includes('material') ||
      challengeText.includes('truck stock')
    ) {
      concernScore += 1
      detectedConcerns.push('job preparation or material readiness')
      suggestedActions.push('review job prep and material readiness before similar calls')
    }

    if (
      challengeText.includes('rush') ||
      challengeText.includes('rushed') ||
      challengeText.includes('behind') ||
      challengeText.includes('late') ||
      challengeText.includes('time') ||
      challengeText.includes('overtime')
    ) {
      concernScore += 1
      detectedConcerns.push('time management pressure')
      suggestedActions.push('look at scheduling, pacing, and time expectations')
    }

    if (
      challengeText.includes('communication') ||
      challengeText.includes('miscommunication') ||
      challengeText.includes('unclear') ||
      challengeText.includes('did not know') ||
      challengeText.includes("didn't know")
    ) {
      concernScore += 1
      detectedConcerns.push('communication clarity')
      suggestedActions.push('clarify expectations and improve handoff communication')
    }

    if (
      challengeText.includes('customer') ||
      challengeText.includes('upset') ||
      challengeText.includes('frustrated')
    ) {
      concernScore += 1
      detectedConcerns.push('customer-facing pressure')
      suggestedActions.push('coach communication approach on difficult customer situations')
    }

    if (
      challengeText.includes('training') ||
      challengeText.includes('unsure') ||
      challengeText.includes('confidence') ||
      challengeText.includes('help') ||
      challengeText.includes('support')
    ) {
      concernScore += 1
      detectedConcerns.push('support or coaching need')
      suggestedActions.push('check whether extra coaching or field support would help')
    }

    if (
      winText.includes('finished') ||
      winText.includes('completed') ||
      winText.includes('got it done')
    ) {
      positiveScore += 1
      detectedPositives.push('follow-through')
    }

    if (
      winText.includes('customer') ||
      winText.includes('happy') ||
      winText.includes('satisfied')
    ) {
      positiveScore += 1
      detectedPositives.push('customer handling')
    }

    if (
      winText.includes('team') ||
      winText.includes('teamwork') ||
      winText.includes('helped') ||
      winText.includes('worked together')
    ) {
      positiveScore += 1
      detectedPositives.push('teamwork')
    }

    if (
      winText.includes('learned') ||
      winText.includes('figured out') ||
      winText.includes('improved') ||
      winText.includes('confident')
    ) {
      positiveScore += 1
      detectedPositives.push('growth mindset')
    }

    if (
      winText.includes('smooth') ||
      winText.includes('good') ||
      winText.includes('well') ||
      winText.includes('success') ||
      winText.includes('solved') ||
      winText.includes('fixed')
    ) {
      positiveScore += 1
      detectedPositives.push('solid execution')
    }

    const uniqueActions = [...new Set(suggestedActions)]

    const actionText =
      uniqueActions.length > 0
        ? uniqueActions.slice(0, 2).join('. ') + '.'
        : 'Recognize the technician’s effort and continue watching for repeat patterns over time.'

    const concernText =
      detectedConcerns.length > 0
        ? detectedConcerns.slice(0, 2).join(' and ')
        : 'no major recurring issue signals'

    const positiveText =
      detectedPositives.length > 0
        ? detectedPositives.slice(0, 2).join(' and ')
        : 'professional effort and willingness to reflect'

    if (concernScore === 0 && positiveScore >= 1) {
      return `Insight: This ${jobTypeValue || 'job'} appears to reflect a mostly healthy call with positive signs around ${positiveText}. Why it matters: recognizing what is going right helps reinforce confidence and consistency. Suggested manager action: acknowledge the win and reinforce the behaviors that led to a solid outcome.`
    }

    if (concernScore <= 1 && positiveScore >= 1) {
      return `Insight: This ${jobTypeValue || 'job'} appears to show a normal field challenge with strengths in ${positiveText}. Why it matters: most jobs include some friction, but this reflection suggests the technician is still showing good habits. Suggested manager action: give brief encouragement and lightly review ${concernText} if it becomes a repeat pattern.`
    }

    if (concernScore <= 2 && positiveScore === 0) {
      return `Insight: This ${jobTypeValue || 'job'} suggests a manageable challenge around ${concernText}. Why it matters: this does not necessarily point to a major issue, but repeated occurrences could affect morale or consistency over time. Suggested manager action: check in briefly and review whether better prep, communication, or support could improve future outcomes.`
    }

    if (concernScore >= 3 && positiveScore >= 1) {
      return `Insight: This ${jobTypeValue || 'job'} shows both meaningful strain around ${concernText} and positive signs in ${positiveText}. Why it matters: the technician appears to be working through real obstacles while still showing strengths worth reinforcing. Suggested manager action: recognize the positives while following up on the support needs behind this call. ${actionText}`
    }

    return `Insight: This ${jobTypeValue || 'job'} may need follow-up due to signals around ${concernText}. Why it matters: when multiple strain indicators appear together, they can point to preventable frustration, inconsistency, or burnout if ignored. Suggested manager action: have a direct but supportive check-in and review what system, prep, or coaching changes could help. ${actionText}`
  }

  const fetchManagerNotes = async () => {
    const { data, error } = await supabase
      .from('ManagerNotes')
      .select('technician_name, note, updated_at')

    if (error) {
      console.log('Supabase manager notes fetch error:', JSON.stringify(error, null, 2))
      return
    }

    const noteMap: Record<string, ManagerNoteRow> = {}

    ;(data || []).forEach((row: ManagerNoteRow) => {
      noteMap[row.technician_name] = row
    })

    setManagerNotes(noteMap)
  }

  const fetchReflections = async () => {
    setLoadingReflections(true)
    setManagerError('')

    const { data, error } = await supabase
      .from('Reflections')
      .select(
        'technician_id, technician_name, job_type, challenge, what_went_well, help_needed, ai_response, manager_insight, created_at'
      )
      .order('created_at', { ascending: false })

    if (error) {
      setManagerError(error.message || 'Unable to load reflections.')
      console.log('Supabase fetch error details:', JSON.stringify(error, null, 2))
      setReflections([])
    } else {
      setReflections((data || []) as Reflection[])
      await fetchManagerNotes()
      await fetchTechnicianIdentityData()
    }

    setLoadingReflections(false)
  }

  useEffect(() => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

    setSpeechSupported(!!SpeechRecognition)

    fetchTechnicianIdentityData()

    return () => {
      if (clearMessageTimeoutRef.current) {
        clearTimeout(clearMessageTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (selectedTechnician) {
      const existingNote = managerNotes[selectedTechnician]?.note || ''
      setManagerNoteText(existingNote)
      setManagerNoteMessage('')
    }
  }, [selectedTechnician, managerNotes])

  useEffect(() => {
    if (view === 'manager') {
      fetchReflections()
    }
  }, [view])

  const saveManagerNote = async () => {
    if (!selectedTechnician) return

    setSavingManagerNote(true)
    setManagerNoteMessage('')

    const trimmedNote = managerNoteText.trim()

    const { error } = await supabase
      .from('ManagerNotes')
      .upsert(
        [
          {
            technician_name: selectedTechnician,
            note: trimmedNote,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'technician_name' }
      )

    if (error) {
      setManagerNoteMessage(`Error saving note: ${error.message}`)
      console.log('Supabase manager note save error:', JSON.stringify(error, null, 2))
    } else {
      setManagerNotes((prev) => ({
        ...prev,
        [selectedTechnician]: {
          technician_name: selectedTechnician,
          note: trimmedNote,
          updated_at: new Date().toISOString(),
        },
      }))
      setManagerNoteMessage('Manager note saved.')
    }

    setSavingManagerNote(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setAiResponse('')

    if (!technicianName || !jobType || !challenge) {
      setMessage('Please fill out name, job type, and the job/challenge field.')
      setLoading(false)
      return
    }

    let resolvedTechnician: { technicianId: string; canonicalName: string }

    try {
      resolvedTechnician = await resolveTechnicianIdentity(technicianName)
    } catch (err: any) {
      setMessage(`Technician identity error: ${err.message || 'Unable to resolve technician.'}`)
      setLoading(false)
      return
    }

    const generatedResponse = `Thanks for sharing this, ${resolvedTechnician.canonicalName}. It sounds like this job brought some real pressure, but it is also helpful to capture what went right. Your honesty matters and helps create a better workplace.`

    const generatedManagerInsight = buildManagerInsight(
      jobType,
      challenge,
      whatWentWell,
      helpNeeded
    )

    const { error } = await supabase.from('Reflections').insert([
      {
        technician_id: resolvedTechnician.technicianId,
        technician_name: resolvedTechnician.canonicalName,
        job_type: jobType,
        challenge,
        what_went_well: whatWentWell,
        help_needed: helpNeeded,
        ai_response: generatedResponse,
        manager_insight: generatedManagerInsight,
        created_at: new Date().toISOString(),
      },
    ])

    if (error) {
      setMessage(`Submit error: ${error.message}`)
      console.log('Supabase insert error details:', JSON.stringify(error, null, 2))
    } else {
      setMessage('Reflection submitted.')
      setAiResponse(generatedResponse)
      setTechnicianName('')
      setJobType('')
      setChallenge('')
      setWhatWentWell('')
      setHelpNeeded('')

      if (clearMessageTimeoutRef.current) {
        clearTimeout(clearMessageTimeoutRef.current)
      }

      clearMessageTimeoutRef.current = setTimeout(() => {
        setAiResponse('')
        setMessage('')
      }, 30000)
    }

    setLoading(false)
  }

  const aiOverview = useMemo(() => {
    const total = reflections.length

    const uniqueTechs = new Set(
      reflections.map((r) => r.technician_name.trim()).filter(Boolean)
    ).size

    const jobTypeCounts: Record<string, number> = {}
    const keywordCounts: Record<string, number> = {}
    const positiveCounts: Record<string, number> = {}

    const keywordMap = [
      'pressure',
      'delay',
      'frustrated',
      'rushed',
      'communication',
      'tools',
      'parts',
      'customer',
      'time',
      'training',
      'support',
      'schedule',
      'install',
      'callback',
      'maintenance',
      'service',
    ]

    const positiveMap = [
      'finished',
      'solved',
      'customer',
      'teamwork',
      'learned',
      'communication',
      'smooth',
      'confident',
      'prepared',
      'success',
    ]

    reflections.forEach((r) => {
      const job = r.job_type?.trim() || 'Unknown'
      jobTypeCounts[job] = (jobTypeCounts[job] || 0) + 1

      const combinedText = `${r.challenge} ${r.help_needed || ''}`.toLowerCase()
      const positiveText = `${r.what_went_well || ''}`.toLowerCase()

      keywordMap.forEach((word) => {
        if (combinedText.includes(word)) {
          keywordCounts[word] = (keywordCounts[word] || 0) + 1
        }
      })

      positiveMap.forEach((word) => {
        if (positiveText.includes(word)) {
          positiveCounts[word] = (positiveCounts[word] || 0) + 1
        }
      })
    })

    const topJobTypes = Object.entries(jobTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    const topThemes = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)

    const topWins = Object.entries(positiveCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    let summary = 'Not enough reflection data yet to generate a strong overview.'

    if (total > 0) {
      const jobSummary =
        topJobTypes.length > 0
          ? topJobTypes.map(([job, count]) => `${job} (${count})`).join(', ')
          : 'No dominant job type yet'

      const themeSummary =
        topThemes.length > 0
          ? topThemes.map(([theme]) => theme).join(', ')
          : 'no clear repeated challenges yet'

      const winSummary =
        topWins.length > 0
          ? topWins.map(([win]) => win).join(', ')
          : 'no repeated wins yet'

      summary = `TradeWise is seeing ${total} reflection${total === 1 ? '' : 's'} across ${uniqueTechs} technician${uniqueTechs === 1 ? '' : 's'}. The most common job types are ${jobSummary}. Repeated challenge themes suggest managers should pay close attention to ${themeSummary}, while positive patterns point to strengths around ${winSummary}.`
    }

    const managerAction =
      topThemes.length > 0
        ? 'Suggested manager focus: reduce repeat friction while reinforcing what is already going right on the team.'
        : 'Suggested manager focus: keep gathering reflections to identify both struggles and strengths.'

    return {
      total,
      uniqueTechs,
      topJobTypes,
      topThemes,
      topWins,
      summary,
      managerAction,
    }
  }, [reflections])

  const weeklyRecap = useMemo(() => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const weekly = reflections.filter((r) => {
      if (!r.created_at) return false
      return new Date(r.created_at) >= sevenDaysAgo
    })

    const total = weekly.length

    const uniqueTechs = new Set(
      weekly.map((r) => r.technician_name.trim()).filter(Boolean)
    ).size

    const jobTypeCounts: Record<string, number> = {}
    const challengeCounts: Record<string, number> = {}
    const winCounts: Record<string, number> = {}

    const challengeKeywords = [
      'pressure',
      'delay',
      'frustrated',
      'rushed',
      'communication',
      'tools',
      'parts',
      'customer',
      'time',
      'training',
      'support',
      'schedule',
      'install',
      'callback',
      'maintenance',
      'service',
      'waiting',
      'miscommunication',
      'overtime',
      'fatigue',
    ]

    const winKeywords = [
      'finished',
      'solved',
      'customer',
      'teamwork',
      'learned',
      'communication',
      'smooth',
      'confident',
      'prepared',
      'success',
      'helped',
      'fixed',
      'completed',
      'grateful',
    ]

    weekly.forEach((r) => {
      const job = r.job_type?.trim() || 'Unknown'
      jobTypeCounts[job] = (jobTypeCounts[job] || 0) + 1

      const challengeText = `${r.challenge} ${r.help_needed || ''}`.toLowerCase()
      const winText = `${r.what_went_well || ''}`.toLowerCase()

      challengeKeywords.forEach((word) => {
        if (challengeText.includes(word)) {
          challengeCounts[word] = (challengeCounts[word] || 0) + 1
        }
      })

      winKeywords.forEach((word) => {
        if (winText.includes(word)) {
          winCounts[word] = (winCounts[word] || 0) + 1
        }
      })
    })

    const topJobTypes = Object.entries(jobTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    const topChallenges = Object.entries(challengeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)

    const topWins = Object.entries(winCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)

    let summary = 'Not enough reflections were submitted this week to build a useful recap yet.'

    if (total > 0) {
      const jobsText =
        topJobTypes.length > 0
          ? topJobTypes.map(([job, count]) => `${job} (${count})`).join(', ')
          : 'no dominant job categories'

      const challengeText =
        topChallenges.length > 0
          ? topChallenges.map(([theme]) => theme).join(', ')
          : 'no repeated challenge patterns'

      const winsText =
        topWins.length > 0
          ? topWins.map(([theme]) => theme).join(', ')
          : 'no repeated positive patterns'

      summary = `Over the last 7 days, TradeWise captured ${total} reflection${total === 1 ? '' : 's'} from ${uniqueTechs} technician${uniqueTechs === 1 ? '' : 's'}. The week centered most heavily around ${jobsText}. Common sources of strain included ${challengeText}. Positive signals this week included ${winsText}. Overall, the team appears to benefit most from clearer support, better preparation, and reinforcement of wins as they happen.`
    }

    let managerFocus =
      'Manager focus for next week: encourage more reflections so the system can identify stronger patterns.'

    if (total > 0) {
      if (topChallenges.length > 0 && topWins.length > 0) {
        managerFocus = `Manager focus for next week: reduce friction around ${topChallenges
          .map(([theme]) => theme)
          .slice(0, 2)
          .join(' and ')}, while reinforcing strengths around ${topWins
          .map(([theme]) => theme)
          .slice(0, 2)
          .join(' and ')}.`
      } else if (topChallenges.length > 0) {
        managerFocus = `Manager focus for next week: review team support around ${topChallenges
          .map(([theme]) => theme)
          .slice(0, 2)
          .join(' and ')}.`
      }
    }

    return {
      total,
      uniqueTechs,
      topJobTypes,
      topChallenges,
      topWins,
      summary,
      managerFocus,
    }
  }, [reflections])

  const technicianDirectory = useMemo(() => {
    const grouped: Record<
      string,
      {
        name: string
        count: number
        lastEntry: string | null
        jobTypeCounts: Record<string, number>
      }
    > = {}

    reflections.forEach((r) => {
      const aliasName = r.technician_name?.trim() || 'Unknown Technician'
      const resolved = technicianAliasMap[normalizeAliasKey(aliasName)]
      const name = resolved?.canonicalName || aliasName

      if (!grouped[name]) {
        grouped[name] = {
          name,
          count: 0,
          lastEntry: null,
          jobTypeCounts: {},
        }
      }

      grouped[name].count += 1

      if (!grouped[name].lastEntry || new Date(r.created_at) > new Date(grouped[name].lastEntry!)) {
        grouped[name].lastEntry = r.created_at
      }

      const job = r.job_type?.trim() || 'Unknown'
      grouped[name].jobTypeCounts[job] = (grouped[name].jobTypeCounts[job] || 0) + 1
    })

    return Object.values(grouped)
      .map((tech) => {
        const topJobTypes = Object.entries(tech.jobTypeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)

        return {
          ...tech,
          topJobTypes,
        }
      })
      .sort((a, b) => {
        if (!a.lastEntry) return 1
        if (!b.lastEntry) return -1
        return new Date(b.lastEntry).getTime() - new Date(a.lastEntry).getTime()
      })
  }, [reflections, technicianAliasMap])

  const burnoutSignals = useMemo(() => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const grouped: Record<string, Reflection[]> = {}

    reflections.forEach((r) => {
      const aliasName = r.technician_name?.trim() || 'Unknown Technician'
      const resolved = technicianAliasMap[normalizeAliasKey(aliasName)]
      const canonicalName = resolved?.canonicalName || aliasName

      if (!grouped[canonicalName]) grouped[canonicalName] = []

      if (r.created_at && new Date(r.created_at) >= sevenDaysAgo) {
        grouped[canonicalName].push(r)
      }
    })

    const signals: BurnoutSignal[] = Object.entries(grouped).map(([technicianName, techRefs]) => {
      let pressureMentions = 0
      let supportMentions = 0
      let positiveMentions = 0
      let heavyJobMixCount = 0

      techRefs.forEach((r) => {
        const combinedChallenge = `${r.challenge || ''} ${r.help_needed || ''}`.toLowerCase()
        const winText = `${r.what_went_well || ''}`.toLowerCase()
        const jobTypeText = `${r.job_type || ''}`.toLowerCase()

        BURNOUT_PRESSURE_KEYWORDS.forEach((word) => {
          if (combinedChallenge.includes(word)) pressureMentions += 1
        })

        BURNOUT_SUPPORT_KEYWORDS.forEach((word) => {
          if (combinedChallenge.includes(word)) supportMentions += 1
        })

        POSITIVE_SIGNAL_KEYWORDS.forEach((word) => {
          if (winText.includes(word)) positiveMentions += 1
        })

        if (
          jobTypeText.includes('installation') ||
          jobTypeText.includes('callback') ||
          jobTypeText.includes('emergency')
        ) {
          heavyJobMixCount += 1
        }
      })

      let score = 0

      if (techRefs.length >= 4) score += 2
      else if (techRefs.length >= 2) score += 1

      if (pressureMentions >= 5) score += 3
      else if (pressureMentions >= 3) score += 2
      else if (pressureMentions >= 1) score += 1

      if (supportMentions >= 4) score += 2
      else if (supportMentions >= 2) score += 1

      if (heavyJobMixCount >= 3) score += 2
      else if (heavyJobMixCount >= 1) score += 1

      if (positiveMentions >= 4) score -= 1

      let level: BurnoutSignalLevel = 'Low'
      if (score >= 6) level = 'High'
      else if (score >= 3) level = 'Moderate'

      const reasons: string[] = []

      if (pressureMentions >= 3) reasons.push('repeated pressure signals')
      if (supportMentions >= 2) reasons.push('signs of needing support')
      if (heavyJobMixCount >= 2) reasons.push('heavy install/callback/emergency mix')
      if (techRefs.length >= 4) reasons.push('high reflection volume this week')

      const positiveCounterweight =
        positiveMentions >= 3
          ? 'There are still some positive signals showing effort and resilience.'
          : ''

      let summary = `${technicianName} is showing a ${level.toLowerCase()} burnout signal this week.`
      if (reasons.length > 0) {
        summary += ` Main drivers: ${reasons.slice(0, 2).join(' and ')}.`
      }
      if (positiveCounterweight) {
        summary += ` ${positiveCounterweight}`
      }

      let managerAction =
        'Check in briefly, thank them for the effort, and keep watching for repeat patterns.'

      if (level === 'Moderate') {
        managerAction =
          'Have a quick supportive check-in, look for one friction point to remove, and reinforce any recent win.'
      }

      if (level === 'High') {
        managerAction =
          'Prioritize a direct supportive conversation, reduce avoidable friction, and review workload, prep, or coaching needs before the next heavy call.'
      }

      const latestEntry =
        techRefs.length > 0
          ? techRefs
              .map((r) => r.created_at)
              .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
          : null

      return {
        technicianName,
        score,
        level,
        summary,
        managerAction,
        weeklyReflectionCount: techRefs.length,
        pressureMentions,
        supportMentions,
        positiveMentions,
        heavyJobMixCount,
        latestEntry,
      }
    })

    return signals.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.weeklyReflectionCount - a.weeklyReflectionCount
    })
  }, [reflections, technicianAliasMap])

  const topBurnoutSignals = useMemo(
    () => burnoutSignals.filter((s) => s.level !== 'Low').slice(0, 3),
    [burnoutSignals]
  )

  const wowMoment = useMemo(() => {
    if (topBurnoutSignals.length === 0) {
      return {
        headline: 'No major burnout signals are standing out right now.',
        summary:
          'TradeWise is not seeing a strong technician risk spike this week. Keep collecting reflections so the system can spot strain early when it appears.',
        action:
          'Best next move: keep getting honest reflections so contractor insights become sharper over time.',
      }
    }

    const top = topBurnoutSignals[0]

    return {
      headline: `${top.technicianName} is the clearest current support flag.`,
      summary: `TradeWise sees a ${top.level.toLowerCase()} burnout signal for ${top.technicianName} based on repeated pressure markers, support signals, and this week’s workload pattern. This is the kind of issue a contractor usually does not see until performance slips or the technician pulls back.`,
      action: top.managerAction,
    }
  }, [topBurnoutSignals])

  const selectedTechnicianReflections = useMemo(() => {
    if (!selectedTechnician) return []

    return reflections.filter((r) => {
      const aliasName = r.technician_name?.trim() || 'Unknown Technician'
      const resolved = technicianAliasMap[normalizeAliasKey(aliasName)]
      const canonicalName = resolved?.canonicalName || aliasName
      return canonicalName === selectedTechnician
    })
  }, [reflections, selectedTechnician, technicianAliasMap])

  const selectedTechnicianWeeklyRecap = useMemo(() => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const weekly = selectedTechnicianReflections.filter((r) => {
      if (!r.created_at) return false
      return new Date(r.created_at) >= sevenDaysAgo
    })

    const total = weekly.length

    const jobTypeCounts: Record<string, number> = {}
    const challengeCounts: Record<string, number> = {}
    const winCounts: Record<string, number> = {}

    const challengeKeywords = [
      'pressure',
      'delay',
      'frustrated',
      'rushed',
      'communication',
      'tools',
      'parts',
      'customer',
      'time',
      'training',
      'support',
      'schedule',
      'install',
      'callback',
      'maintenance',
      'service',
      'waiting',
      'miscommunication',
      'overtime',
      'fatigue',
    ]

    const winKeywords = [
      'finished',
      'solved',
      'customer',
      'teamwork',
      'learned',
      'communication',
      'smooth',
      'confident',
      'prepared',
      'success',
      'helped',
      'fixed',
      'completed',
      'grateful',
    ]

    weekly.forEach((r) => {
      const job = r.job_type?.trim() || 'Unknown'
      jobTypeCounts[job] = (jobTypeCounts[job] || 0) + 1

      const challengeText = `${r.challenge} ${r.help_needed || ''}`.toLowerCase()
      const winText = `${r.what_went_well || ''}`.toLowerCase()

      challengeKeywords.forEach((word) => {
        if (challengeText.includes(word)) {
          challengeCounts[word] = (challengeCounts[word] || 0) + 1
        }
      })

      winKeywords.forEach((word) => {
        if (winText.includes(word)) {
          winCounts[word] = (winCounts[word] || 0) + 1
        }
      })
    })

    const topJobTypes = Object.entries(jobTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    const topChallenges = Object.entries(challengeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)

    const topWins = Object.entries(winCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)

    let summary = 'Not enough reflections this week yet to build a useful technician recap.'

    if (total > 0 && selectedTechnician) {
      const jobsText =
        topJobTypes.length > 0
          ? topJobTypes.map(([job, count]) => `${job} (${count})`).join(', ')
          : 'no dominant job mix yet'

      const challengeText =
        topChallenges.length > 0
          ? topChallenges.map(([theme]) => theme).join(', ')
          : 'no repeated challenge patterns'

      const winsText =
        topWins.length > 0
          ? topWins.map(([theme]) => theme).join(', ')
          : 'no repeated wins yet'

      summary = `${selectedTechnician} submitted ${total} reflection${total === 1 ? '' : 's'} in the last 7 days. Their week centered most heavily around ${jobsText}. Repeated challenge patterns suggest attention may be needed around ${challengeText}. Positive signals point to strengths in ${winsText}. Overall, this technician appears to benefit most from reinforcing wins while smoothing out repeat obstacles.`
    }

    let managerFocus =
      'Manager focus: keep gathering reflections so stronger individual patterns can develop.'

    if (total > 0) {
      if (topChallenges.length > 0 && topWins.length > 0) {
        managerFocus = `Manager focus: reinforce strengths around ${topWins
          .map(([theme]) => theme)
          .slice(0, 2)
          .join(' and ')} while following up on ${topChallenges
          .map(([theme]) => theme)
          .slice(0, 2)
          .join(' and ')}.`
      } else if (topChallenges.length > 0) {
        managerFocus = `Manager focus: review recurring themes around ${topChallenges
          .map(([theme]) => theme)
          .slice(0, 2)
          .join(' and ')}.`
      } else if (topWins.length > 0) {
        managerFocus = `Manager focus: recognize strengths around ${topWins
          .map(([theme]) => theme)
          .slice(0, 2)
          .join(' and ')} and encourage continued growth.`
      }
    }

    return {
      total,
      topJobTypes,
      topChallenges,
      topWins,
      summary,
      managerFocus,
    }
  }, [selectedTechnicianReflections, selectedTechnician])

  const selectedTechnicianSignal = useMemo(() => {
    if (!selectedTechnician) return null
    return burnoutSignals.find((signal) => signal.technicianName === selectedTechnician) || null
  }, [selectedTechnician, burnoutSignals])

  const getSignalBadgeStyle = (level: BurnoutSignalLevel) => {
    if (level === 'High') return styles.signalBadgeHigh
    if (level === 'Moderate') return styles.signalBadgeModerate
    return styles.signalBadgeLow
  }

  const openTechnicianProfile = (name: string) => {
    const resolved = technicianAliasMap[normalizeAliasKey(name)]
    setSelectedTechnician(resolved?.canonicalName || name)
    setManagerScreen('profile')
  }

  const renderManagerNav = () => (
    <div style={styles.managerNav}>
      <button
        type="button"
        onClick={() => setManagerScreen('dashboard')}
        style={managerScreen === 'dashboard' ? styles.activeManagerNavBtn : styles.managerNavBtn}
      >
        Dashboard
      </button>
      <button
        type="button"
        onClick={() => setManagerScreen('directory')}
        style={managerScreen === 'directory' ? styles.activeManagerNavBtn : styles.managerNavBtn}
      >
        Technician Directory
      </button>
      {selectedTechnician && (
        <button
          type="button"
          onClick={() => setManagerScreen('profile')}
          style={managerScreen === 'profile' ? styles.activeManagerNavBtn : styles.managerNavBtn}
        >
          {selectedTechnician}
        </button>
      )}
    </div>
  )

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>TradeWise</h1>

          <div style={styles.toggle}>
            <button
              onClick={() => setView('tech')}
              style={view === 'tech' ? styles.activeBtn : styles.btn}
            >
              Technician
            </button>
            <button
              onClick={() => setView('manager')}
              style={view === 'manager' ? styles.activeBtn : styles.btn}
            >
              Manager
            </button>
          </div>
        </div>

        {view === 'tech' && (
          <form onSubmit={handleSubmit} style={styles.form}>
            <select
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
              style={styles.input}
            >
              <option value="">Select Technician</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.canonical_name}>
                  {tech.canonical_name}
                </option>
              ))}
            </select>

            <input
              placeholder="Or type new technician name"
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
              style={styles.input}
            />

            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              style={styles.input}
            >
              <option value="">Select Job Type</option>
              {JOB_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            {speechSupported && (
              <div style={styles.guidedBox}>
                <div style={styles.guidedHeader}>
                  <strong>Voice Reflection</strong>
                  <span style={styles.guidedBadge}>Guided</span>
                </div>

                <p style={styles.guidedText}>
                  Tap one button and TradeWise will guide the technician through name, job type,
                  job details, what went well, and what would have helped.
                </p>

                <div style={styles.guidedActions}>
                  <button
                    type="button"
                    onClick={startFullReflectionRecording}
                    style={styles.recordButton}
                    disabled={guidedRecording}
                  >
                    {guidedRecording ? 'Recording in Progress...' : '🎙️ Record Full Reflection'}
                  </button>

                  {guidedRecording && (
                    <button
                      type="button"
                      onClick={cancelFullReflectionRecording}
                      style={styles.cancelButton}
                    >
                      Stop Recording
                    </button>
                  )}
                </div>

                {guidedRecording && (
                  <div style={styles.promptBox}>
                    <strong>Current Prompt:</strong>
                    <p style={{ margin: '8px 0 0 0' }}>
                      {guidedPrompt || 'Preparing first question...'}
                    </p>
                    {guidedStep && (
                      <p style={styles.promptSubtext}>
                        Active section:{' '}
                        {guidedStep === 'technicianName'
                          ? 'Technician Name'
                          : guidedStep === 'jobType'
                          ? 'Job Type'
                          : guidedStep === 'challenge'
                          ? 'Job Details and Challenges'
                          : guidedStep === 'whatWentWell'
                          ? 'What Went Well'
                          : 'What Would Have Helped'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={styles.fieldWrap}>
              <textarea
                placeholder="Tell me about the job and any challenges you faced"
                value={challenge}
                onChange={(e) => setChallenge(e.target.value)}
                style={styles.textarea}
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={() => startListening('challenge')}
                  style={styles.micButton}
                >
                  {isListening && activeField === 'challenge' ? 'Listening...' : '🎤 Speak'}
                </button>
              )}
            </div>

            <div style={styles.fieldWrap}>
              <textarea
                placeholder="What went well?"
                value={whatWentWell}
                onChange={(e) => setWhatWentWell(e.target.value)}
                style={styles.textarea}
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={() => startListening('whatWentWell')}
                  style={styles.micButton}
                >
                  {isListening && activeField === 'whatWentWell'
                    ? 'Listening...'
                    : '🎤 Speak'}
                </button>
              )}
            </div>

            <div style={styles.fieldWrap}>
              <textarea
                placeholder="What would have helped?"
                value={helpNeeded}
                onChange={(e) => setHelpNeeded(e.target.value)}
                style={styles.textarea}
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={() => startListening('helpNeeded')}
                  style={styles.micButton}
                >
                  {isListening && activeField === 'helpNeeded' ? 'Listening...' : '🎤 Speak'}
                </button>
              )}
            </div>

            {!speechSupported && (
              <div style={styles.infoBox}>
                Speech-to-text is not supported in this browser. Chrome usually works best.
              </div>
            )}

            <button type="submit" style={styles.submit}>
              {loading ? 'Submitting...' : 'Submit'}
            </button>

            {message && <p>{message}</p>}

            {aiResponse && message === 'Reflection submitted.' && (
              <div style={styles.aiBox}>
                <strong>AI Response:</strong>
                <p>{aiResponse}</p>
              </div>
            )}
          </form>
        )}

        {view === 'manager' && (
          <div>
            <h2 style={{ marginBottom: '16px' }}>Manager Dashboard</h2>

            {renderManagerNav()}

            {loadingReflections && <p>Loading...</p>}

            {managerError && (
              <div style={styles.errorBox}>
                <strong>Manager view error:</strong>
                <p style={{ marginTop: 8 }}>{managerError}</p>
              </div>
            )}

            {!loadingReflections && !managerError && managerScreen === 'dashboard' && (
              <>
                <div style={styles.wowCard}>
                  <div style={styles.overviewHeader}>
                    <h3 style={{ margin: 0 }}>Contractor Wow Moment</h3>
                    <span style={styles.wowBadge}>Early Warning</span>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>{wowMoment.headline}</strong>
                    <p style={styles.overviewText}>{wowMoment.summary}</p>
                  </div>

                  <div style={styles.actionBox}>
                    <strong>Recommended Next Move</strong>
                    <p style={{ margin: '8px 0 0 0' }}>{wowMoment.action}</p>
                  </div>
                </div>

                <div style={styles.overviewCard}>
                  <div style={styles.overviewHeader}>
                    <h3 style={{ margin: 0 }}>Burnout Signal Watch</h3>
                    <span style={styles.overviewBadge}>Last 7 Days</span>
                  </div>

                  {burnoutSignals.length === 0 && (
                    <p style={styles.overviewText}>No technician signals to display yet.</p>
                  )}

                  <div style={styles.signalList}>
                    {burnoutSignals.slice(0, 5).map((signal) => (
                      <button
                        key={signal.technicianName}
                        type="button"
                        onClick={() => openTechnicianProfile(signal.technicianName)}
                        style={styles.signalRow}
                      >
                        <div>
                          <div style={styles.signalRowHeader}>
                            <strong>{signal.technicianName}</strong>
                            <span style={getSignalBadgeStyle(signal.level)}>
                              {signal.level} Signal
                            </span>
                          </div>
                          <p style={styles.signalText}>{signal.summary}</p>
                        </div>

                        <div style={styles.signalMeta}>
                          <div>{signal.weeklyReflectionCount} weekly logs</div>
                          <div>Score: {signal.score}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={styles.weeklyCard}>
                  <div style={styles.overviewHeader}>
                    <h3 style={{ margin: 0 }}>Weekly AI Recap</h3>
                    <span style={styles.weeklyBadge}>Last 7 Days</span>
                  </div>

                  <div style={styles.statGrid}>
                    <div style={styles.statBox}>
                      <div style={styles.statNumber}>{weeklyRecap.total}</div>
                      <div style={styles.statLabel}>Weekly Reflections</div>
                    </div>

                    <div style={styles.statBox}>
                      <div style={styles.statNumber}>{weeklyRecap.uniqueTechs}</div>
                      <div style={styles.statLabel}>Weekly Technicians</div>
                    </div>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>Weekly Job Mix</strong>
                    <p style={styles.overviewText}>
                      {weeklyRecap.topJobTypes.length > 0
                        ? weeklyRecap.topJobTypes
                            .map(([job, count]) => `${job} (${count})`)
                            .join(', ')
                        : 'No weekly job trends yet.'}
                    </p>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>Weekly Friction Themes</strong>
                    <p style={styles.overviewText}>
                      {weeklyRecap.topChallenges.length > 0
                        ? weeklyRecap.topChallenges.map(([theme]) => theme).join(', ')
                        : 'No repeated weekly challenge themes detected yet.'}
                    </p>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>Weekly Positive Signals</strong>
                    <p style={styles.overviewText}>
                      {weeklyRecap.topWins.length > 0
                        ? weeklyRecap.topWins.map(([theme]) => theme).join(', ')
                        : 'No repeated weekly positive signals detected yet.'}
                    </p>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>Weekly AI Report</strong>
                    <p style={styles.overviewText}>{weeklyRecap.summary}</p>
                  </div>

                  <div style={styles.actionBox}>
                    <strong>Next Week Manager Focus</strong>
                    <p style={{ margin: '8px 0 0 0' }}>{weeklyRecap.managerFocus}</p>
                  </div>
                </div>

                <div style={styles.overviewCard}>
                  <div style={styles.overviewHeader}>
                    <h3 style={{ margin: 0 }}>AI Overview</h3>
                    <span style={styles.overviewBadge}>Manager Insight</span>
                  </div>

                  <div style={styles.statGrid}>
                    <div style={styles.statBox}>
                      <div style={styles.statNumber}>{aiOverview.total}</div>
                      <div style={styles.statLabel}>Total Reflections</div>
                    </div>

                    <div style={styles.statBox}>
                      <div style={styles.statNumber}>{aiOverview.uniqueTechs}</div>
                      <div style={styles.statLabel}>Technicians Represented</div>
                    </div>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>Top Job Types</strong>
                    <p style={styles.overviewText}>
                      {aiOverview.topJobTypes.length > 0
                        ? aiOverview.topJobTypes
                            .map(([job, count]) => `${job} (${count})`)
                            .join(', ')
                        : 'No job trends yet.'}
                    </p>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>Repeated Challenges</strong>
                    <p style={styles.overviewText}>
                      {aiOverview.topThemes.length > 0
                        ? aiOverview.topThemes.map(([theme]) => theme).join(', ')
                        : 'No repeated challenge themes detected yet.'}
                    </p>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>Positive Signals</strong>
                    <p style={styles.overviewText}>
                      {aiOverview.topWins.length > 0
                        ? aiOverview.topWins.map(([win]) => win).join(', ')
                        : 'No repeated positive patterns detected yet.'}
                    </p>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>AI Summary</strong>
                    <p style={styles.overviewText}>{aiOverview.summary}</p>
                  </div>

                  <div style={styles.actionBox}>
                    <strong>Suggested Manager Action</strong>
                    <p style={{ margin: '8px 0 0 0' }}>{aiOverview.managerAction}</p>
                  </div>
                </div>
              </>
            )}

            {!loadingReflections && !managerError && managerScreen === 'directory' && (
              <div>
                <div style={styles.overviewCard}>
                  <div style={styles.overviewHeader}>
                    <h3 style={{ margin: 0 }}>Technician Directory</h3>
                    <span style={styles.overviewBadge}>Merged by Alias</span>
                  </div>
                  <p style={styles.overviewText}>
                    Click a technician to open their profile, view their reflection history, see
                    their individual weekly recap, add private manager notes, and spot burnout risk
                    before it turns into a callback, bad attitude, or resignation.
                  </p>
                </div>

                {technicianDirectory.length === 0 && <p>No technicians found yet.</p>}

                <div style={styles.directoryGrid}>
                  {technicianDirectory.map((tech) => {
                    const signal =
                      burnoutSignals.find((s) => s.technicianName === tech.name) || null

                    return (
                      <button
                        key={tech.name}
                        type="button"
                        onClick={() => openTechnicianProfile(tech.name)}
                        style={styles.technicianCard}
                      >
                        <div style={styles.techCardHeader}>
                          <h3 style={{ margin: 0 }}>{tech.name}</h3>
                          <span style={styles.techCardBadge}>{tech.count} Logs</span>
                        </div>

                        {signal && (
                          <div style={styles.techSignalWrap}>
                            <span style={getSignalBadgeStyle(signal.level)}>
                              {signal.level} Burnout Signal
                            </span>
                          </div>
                        )}

                        <p style={styles.techCardText}>
                          <strong>Most Recent:</strong>{' '}
                          {tech.lastEntry ? new Date(tech.lastEntry).toLocaleString() : 'No entries'}
                        </p>

                        <p style={styles.techCardText}>
                          <strong>Top Job Types:</strong>{' '}
                          {tech.topJobTypes.length > 0
                            ? tech.topJobTypes.map(([job, count]) => `${job} (${count})`).join(', ')
                            : 'No trends yet'}
                        </p>

                        {signal && (
                          <p style={styles.techCardText}>
                            <strong>Signal Summary:</strong> {signal.summary}
                          </p>
                        )}

                        <p style={styles.techCardText}>
                          <strong>Manager Note:</strong>{' '}
                          {managerNotes[tech.name]?.note?.trim() ? 'Saved' : 'No private note yet'}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {!loadingReflections && !managerError && managerScreen === 'profile' && (
              <div>
                <div style={styles.profileHeaderCard}>
                  <div>
                    <div style={styles.profileTitleRow}>
                      <h3 style={{ margin: 0 }}>{selectedTechnician || 'Technician Profile'}</h3>
                      {selectedTechnicianSignal && (
                        <span style={getSignalBadgeStyle(selectedTechnicianSignal.level)}>
                          {selectedTechnicianSignal.level} Burnout Signal
                        </span>
                      )}
                    </div>
                    <p style={{ marginTop: 8, marginBottom: 0, color: '#486581' }}>
                      Reflection history, weekly AI recap, private manager notes, and burnout watch
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setManagerScreen('directory')}
                    style={styles.backButton}
                  >
                    Back to Directory
                  </button>
                </div>

                {selectedTechnicianSignal && (
                  <div style={styles.wowCard}>
                    <div style={styles.overviewHeader}>
                      <h3 style={{ margin: 0 }}>Burnout Signal Snapshot</h3>
                      <span style={styles.wowBadge}>Wow Layer</span>
                    </div>

                    <div style={styles.overviewSection}>
                      <strong>{selectedTechnicianSignal.technicianName}</strong>
                      <p style={styles.overviewText}>{selectedTechnicianSignal.summary}</p>
                    </div>

                    <div style={styles.statGrid}>
                      <div style={styles.statBox}>
                        <div style={styles.statNumber}>{selectedTechnicianSignal.weeklyReflectionCount}</div>
                        <div style={styles.statLabel}>Weekly Logs</div>
                      </div>
                      <div style={styles.statBox}>
                        <div style={styles.statNumber}>{selectedTechnicianSignal.pressureMentions}</div>
                        <div style={styles.statLabel}>Pressure Markers</div>
                      </div>
                      <div style={styles.statBox}>
                        <div style={styles.statNumber}>{selectedTechnicianSignal.supportMentions}</div>
                        <div style={styles.statLabel}>Support Signals</div>
                      </div>
                    </div>

                    <div style={styles.actionBox}>
                      <strong>Recommended Manager Move</strong>
                      <p style={{ margin: '8px 0 0 0' }}>{selectedTechnicianSignal.managerAction}</p>
                    </div>
                  </div>
                )}

                <div style={styles.noteCard}>
                  <div style={styles.overviewHeader}>
                    <h3 style={{ margin: 0 }}>Private Manager Notes</h3>
                    <span style={styles.overviewBadge}>Internal Only</span>
                  </div>

                  <textarea
                    value={managerNoteText}
                    onChange={(e) => setManagerNoteText(e.target.value)}
                    placeholder="Add a private manager note for this technician..."
                    style={styles.noteTextarea}
                  />

                  <div style={styles.noteActions}>
                    <button
                      type="button"
                      onClick={saveManagerNote}
                      style={styles.saveNoteButton}
                      disabled={savingManagerNote || !selectedTechnician}
                    >
                      {savingManagerNote ? 'Saving...' : 'Save Manager Note'}
                    </button>

                    {selectedTechnician && managerNotes[selectedTechnician]?.updated_at && (
                      <span style={styles.noteMeta}>
                        Last updated:{' '}
                        {new Date(
                          managerNotes[selectedTechnician].updated_at as string
                        ).toLocaleString()}
                      </span>
                    )}
                  </div>

                  {managerNoteMessage && (
                    <p style={{ margin: '8px 0 0 0', color: '#243b53' }}>{managerNoteMessage}</p>
                  )}
                </div>

                <div style={styles.weeklyCard}>
                  <div style={styles.overviewHeader}>
                    <h3 style={{ margin: 0 }}>Weekly Technician Recap</h3>
                    <span style={styles.weeklyBadge}>Last 7 Days</span>
                  </div>

                  <div style={styles.statGrid}>
                    <div style={styles.statBox}>
                      <div style={styles.statNumber}>{selectedTechnicianWeeklyRecap.total}</div>
                      <div style={styles.statLabel}>Weekly Reflections</div>
                    </div>

                    <div style={styles.statBox}>
                      <div style={styles.statNumber}>{selectedTechnicianReflections.length}</div>
                      <div style={styles.statLabel}>Total Reflection History</div>
                    </div>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>Weekly Job Mix</strong>
                    <p style={styles.overviewText}>
                      {selectedTechnicianWeeklyRecap.topJobTypes.length > 0
                        ? selectedTechnicianWeeklyRecap.topJobTypes
                            .map(([job, count]) => `${job} (${count})`)
                            .join(', ')
                        : 'No weekly job trends yet.'}
                    </p>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>Repeated Weekly Challenges</strong>
                    <p style={styles.overviewText}>
                      {selectedTechnicianWeeklyRecap.topChallenges.length > 0
                        ? selectedTechnicianWeeklyRecap.topChallenges
                            .map(([theme]) => theme)
                            .join(', ')
                        : 'No repeated weekly challenge themes detected yet.'}
                    </p>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>Repeated Weekly Wins</strong>
                    <p style={styles.overviewText}>
                      {selectedTechnicianWeeklyRecap.topWins.length > 0
                        ? selectedTechnicianWeeklyRecap.topWins.map(([theme]) => theme).join(', ')
                        : 'No repeated weekly wins detected yet.'}
                    </p>
                  </div>

                  <div style={styles.overviewSection}>
                    <strong>AI Summary</strong>
                    <p style={styles.overviewText}>{selectedTechnicianWeeklyRecap.summary}</p>
                  </div>

                  <div style={styles.actionBox}>
                    <strong>Manager Focus</strong>
                    <p style={{ margin: '8px 0 0 0' }}>{selectedTechnicianWeeklyRecap.managerFocus}</p>
                  </div>
                </div>

                <div style={styles.overviewCard}>
                  <div style={styles.overviewHeader}>
                    <h3 style={{ margin: 0 }}>Reflection History</h3>
                    <span style={styles.overviewBadge}>
                      {selectedTechnicianReflections.length} Total
                    </span>
                  </div>

                  {selectedTechnicianReflections.length === 0 && (
                    <p style={styles.overviewText}>No reflections found for this technician yet.</p>
                  )}
                </div>

                {selectedTechnicianReflections.map((r, index) => (
                  <div key={`${r.technician_name}-${r.created_at}-${index}`} style={styles.card}>
                    <h3>{r.technician_name}</h3>
                    <p><strong>Job:</strong> {r.job_type}</p>
                    <p><strong>Challenge:</strong> {r.challenge}</p>
                    <p><strong>What Went Well:</strong> {r.what_went_well || 'No win entered.'}</p>
                    <p><strong>Help Needed:</strong> {r.help_needed || 'None provided'}</p>

                    <div style={styles.aiBox}>
                      <strong>Technician AI Response:</strong>
                      <p>{r.ai_response || 'No AI response saved.'}</p>
                    </div>

                    <div style={styles.managerInsightBox}>
                      <strong>Manager Insight:</strong>
                      <p>{r.manager_insight || 'No manager insight saved.'}</p>
                    </div>

                    <small>{new Date(r.created_at).toLocaleString()}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

const styles: any = {
  page: {
    background: '#f4f7fb',
    minHeight: '100vh',
    padding: '40px',
    fontFamily: 'Arial',
  },
  container: {
    maxWidth: '1050px',
    margin: '0 auto',
    background: '#fff',
    padding: '30px',
    borderRadius: '12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '20px',
    gap: '12px',
    flexWrap: 'wrap',
  },
  title: {
    margin: 0,
  },
  toggle: {
    display: 'flex',
    gap: '10px',
  },
  btn: {
    padding: '10px',
    background: '#ccc',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '8px',
  },
  activeBtn: {
    padding: '10px',
    background: '#0b6e4f',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '8px',
  },
  managerNav: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '18px',
  },
  managerNavBtn: {
    padding: '10px 12px',
    background: '#d9e2ec',
    color: '#102a43',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  activeManagerNavBtn: {
    padding: '10px 12px',
    background: '#102a43',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  form: {
    display: 'grid',
    gap: '12px',
  },
  input: {
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #ccc',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    padding: '10px',
    minHeight: '90px',
    borderRadius: '8px',
    border: '1px solid #ccc',
    width: '100%',
    boxSizing: 'border-box',
  },
  fieldWrap: {
    display: 'grid',
    gap: '8px',
  },
  micButton: {
    padding: '10px 12px',
    background: '#102a43',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    width: 'fit-content',
  },
  guidedBox: {
    background: '#eef6ff',
    border: '1px solid #c9ddf5',
    padding: '16px',
    borderRadius: '10px',
    display: 'grid',
    gap: '12px',
  },
  guidedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  guidedBadge: {
    background: '#102a43',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
  },
  guidedText: {
    margin: 0,
    color: '#243b53',
    lineHeight: 1.5,
  },
  guidedActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  recordButton: {
    padding: '12px 14px',
    background: '#0b6e4f',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  cancelButton: {
    padding: '12px 14px',
    background: '#b42318',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  promptBox: {
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: '8px',
    padding: '12px',
  },
  promptSubtext: {
    margin: '8px 0 0 0',
    color: '#486581',
    fontSize: '13px',
  },
  infoBox: {
    background: '#fff8e1',
    border: '1px solid #f0d58c',
    color: '#6b5300',
    padding: '12px',
    borderRadius: '8px',
  },
  submit: {
    padding: '12px',
    background: '#0b6e4f',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  directoryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '14px',
  },
  technicianCard: {
    textAlign: 'left',
    border: '1px solid #d9e2ec',
    borderRadius: '12px',
    background: '#fff',
    padding: '16px',
    cursor: 'pointer',
  },
  techCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  techCardBadge: {
    background: '#e6f4ea',
    color: '#1e4620',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
  },
  techSignalWrap: {
    marginBottom: '10px',
  },
  techCardText: {
    margin: '8px 0',
    color: '#243b53',
    lineHeight: 1.5,
  },
  profileHeaderCard: {
    background: '#f8fbff',
    border: '1px solid #d8e6f5',
    padding: '18px',
    borderRadius: '12px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  profileTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  backButton: {
    padding: '10px 12px',
    background: '#102a43',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  noteCard: {
    background: '#fffdf5',
    border: '1px solid #ead9a7',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '20px',
  },
  noteTextarea: {
    width: '100%',
    minHeight: '120px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #ccc',
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  noteActions: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    marginTop: '12px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  saveNoteButton: {
    padding: '12px 14px',
    background: '#8b5e00',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  noteMeta: {
    color: '#486581',
    fontSize: '13px',
  },
  card: {
    border: '1px solid #ddd',
    padding: '16px',
    marginBottom: '12px',
    borderRadius: '8px',
    background: '#fff',
  },
  aiBox: {
    background: '#eef',
    padding: '10px',
    marginTop: '10px',
    borderRadius: '6px',
  },
  managerInsightBox: {
    background: '#eef9f1',
    border: '1px solid #bfdcca',
    padding: '10px',
    marginTop: '10px',
    borderRadius: '6px',
    color: '#1e4620',
  },
  errorBox: {
    background: '#fdecec',
    border: '1px solid #f3b9b9',
    color: '#7a1f1f',
    padding: '14px',
    borderRadius: '8px',
    marginBottom: '12px',
  },
  overviewCard: {
    background: '#f8fbff',
    border: '1px solid #d8e6f5',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '20px',
  },
  weeklyCard: {
    background: '#fff8ef',
    border: '1px solid #f1d1a8',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '20px',
  },
  wowCard: {
    background: '#fff4f4',
    border: '1px solid #f3c2c2',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '20px',
  },
  overviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
    gap: '10px',
    flexWrap: 'wrap',
  },
  overviewBadge: {
    background: '#102a43',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
  },
  weeklyBadge: {
    background: '#8b5e00',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
  },
  wowBadge: {
    background: '#b42318',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
  },
  signalBadgeHigh: {
    background: '#b42318',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    display: 'inline-block',
  },
  signalBadgeModerate: {
    background: '#b54708',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    display: 'inline-block',
  },
  signalBadgeLow: {
    background: '#0b6e4f',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    display: 'inline-block',
  },
  signalList: {
    display: 'grid',
    gap: '12px',
  },
  signalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    textAlign: 'left',
    border: '1px solid #d9e2ec',
    borderRadius: '10px',
    padding: '14px',
    background: '#fff',
    cursor: 'pointer',
  },
  signalRowHeader: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: '8px',
  },
  signalText: {
    margin: 0,
    color: '#243b53',
    lineHeight: 1.5,
    maxWidth: '700px',
  },
  signalMeta: {
    color: '#486581',
    fontSize: '13px',
    display: 'grid',
    gap: '6px',
    minWidth: '120px',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  },
  statBox: {
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: '10px',
    padding: '16px',
  },
  statNumber: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#102a43',
  },
  statLabel: {
    fontSize: '13px',
    color: '#486581',
    marginTop: '6px',
  },
  overviewSection: {
    marginBottom: '14px',
  },
  overviewText: {
    margin: '6px 0 0 0',
    color: '#243b53',
    lineHeight: 1.5,
  },
  actionBox: {
    background: '#e6f4ea',
    border: '1px solid #bfdcca',
    padding: '14px',
    borderRadius: '10px',
    marginTop: '8px',
    color: '#1e4620',
  },
}