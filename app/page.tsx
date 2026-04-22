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
  | 'reflection'

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

type InterpretationResult = {
  situation: string
  emotion: string
  riskLevel: 'Low' | 'Medium' | 'High'
  rootCause: string
  nextStep: string
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

export default function Home() {
  const [view, setView] = useState<'tech' | 'manager'>('tech')
  const [managerScreen, setManagerScreen] = useState<'dashboard' | 'directory' | 'profile'>(
    'dashboard'
  )
  const [selectedTechnician, setSelectedTechnician] = useState<string | null>(null)
  const [technicianName, setTechnicianName] = useState('')
  const [jobType, setJobType] = useState('')
  const [reflection, setReflection] = useState('')
  const [managerReflection, setManagerReflection] = useState('')
  const [teamSummaryLoading, setTeamSummaryLoading] = useState(false)
  const [teamSummaryError, setTeamSummaryError] = useState('')
  const [teamSummaryResult, setTeamSummaryResult] = useState<any>(null)  
  const [message, setMessage] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [burnoutSignal, setBurnoutSignal] = useState('')
  const [understandingSnapshot, setUnderstandingSnapshot] =
    useState<InterpretationResult | null>(null)
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

  useEffect(() => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

    setSpeechSupported(!!SpeechRecognition)

    return () => {
      if (clearMessageTimeoutRef.current) {
        clearTimeout(clearMessageTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    fetchTechnicianIdentityData()
  }, [])

  useEffect(() => {
    if (selectedTechnician) {
      const existingNote = managerNotes[selectedTechnician]?.note || ''
      setManagerNoteText(existingNote)
      setManagerNoteMessage('')
    }
  }, [selectedTechnician, managerNotes])

  const normalizeAliasKey = (value: string) => value.trim().toLowerCase()

  const normalizeJobType = (spokenValue: string) => {
    const value = spokenValue.toLowerCase().trim()

    if (value.includes('service') || value.includes('service call') || value.includes('repair')) {
      return 'Service Call'
    }

    if (
      value.includes('install') ||
      value.includes('installation') ||
      value.includes('new install')
    ) {
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
      return alreadyExists ? prev : [...prev, technicianRecord]
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
    if (field === 'reflection') setReflection(value.trim())
  
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

  if (field === 'reflection') {
    setReflection((prev) => (prev ? `${prev} ${cleanValue}` : cleanValue))
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

  const moveToNextGuidedStep = (completedField: VoiceField) => {
  if (!guidedModeRef.current) return

  if (completedField === 'technicianName') {
    const nextPrompt = 'What type of job was this?'
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
    const nextPrompt = 'Tell me about the job. What happened today?'
    setGuidedStep('reflection')
    setGuidedPrompt(nextPrompt)

    speakPrompt(nextPrompt, () => {
      if (guidedModeRef.current) {
        startRecognitionForField('reflection', true)
      }
    })
    return
  }

  if (completedField === 'reflection') {
    speakPrompt('Got it. Reflection recorded.', () => {
      resetGuidedRecording()
    })
  }
}
  const buildBurnoutSignal = (
    challengeValue: string,
    helpNeededValue: string,
    whatWentWellValue: string
  ) => {
    const combined = `${challengeValue} ${helpNeededValue}`.toLowerCase()
    const positive = `${whatWentWellValue}`.toLowerCase()

    let score = 0

    if (
      combined.includes('tired') ||
      combined.includes('exhausted') ||
      combined.includes('burned out') ||
      combined.includes('burnout') ||
      combined.includes('fatigue')
    ) {
      score += 2
    }

    if (
      combined.includes('overwhelmed') ||
      combined.includes('stressed') ||
      combined.includes('stress') ||
      combined.includes('pressure')
    ) {
      score += 1
    }

    if (
      combined.includes('rushed') ||
      combined.includes('behind') ||
      combined.includes('late') ||
      combined.includes('overtime') ||
      combined.includes('long day') ||
      combined.includes('long days')
    ) {
      score += 1
    }

    if (
      combined.includes('family') ||
      combined.includes('missed') ||
      combined.includes('kids') ||
      combined.includes('son') ||
      combined.includes('daughter') ||
      combined.includes('wife') ||
      combined.includes('home')
    ) {
      score += 1
    }

    if (
      positive.includes('good') ||
      positive.includes('smooth') ||
      positive.includes('confident') ||
      positive.includes('success')
    ) {
      score -= 1
    }

    if (score >= 3) {
      return 'This reflection suggests elevated strain. A supportive manager check-in may be needed.'
    }

    if (score >= 2) {
      return 'Some signs of strain are present. Keep an eye on workload, support, and repeated pressure.'
    }

    return ''
  }

  const interpretReflection = (
    jobTypeValue: string,
    challengeValue: string,
    whatWentWellValue: string,
    helpNeededValue: string
  ): InterpretationResult => {
    const challengeText = `${challengeValue} ${helpNeededValue}`.toLowerCase()
    const winText = `${whatWentWellValue}`.toLowerCase()

    let situation = `${jobTypeValue || 'Job'} with normal field friction`
    let emotion = 'Some pressure, but manageable'
    let riskLevel: 'Low' | 'Medium' | 'High' = 'Low'
    let rootCause = 'General field friction'
    let nextStep = 'Recognize the effort and keep watching for patterns.'

    let score = 0

    if (
      challengeText.includes('rushed') ||
      challengeText.includes('behind') ||
      challengeText.includes('late') ||
      challengeText.includes('overtime') ||
      challengeText.includes('long day') ||
      challengeText.includes('time')
    ) {
      situation = 'The job appears to have run under time pressure'
      emotion = 'Felt rushed or squeezed by the pace'
      rootCause = 'Time estimate mismatch or schedule pressure'
      nextStep = 'Review scheduling, pacing, and whether the expected job time was realistic.'
      score += 1
    }

    if (
      challengeText.includes('part') ||
      challengeText.includes('parts') ||
      challengeText.includes('material') ||
      challengeText.includes('truck stock') ||
      challengeText.includes('waiting')
    ) {
      situation = 'The job appears to have been slowed by prep or material issues'
      emotion = 'Likely frustrated by things outside the technician’s control'
      rootCause = 'Material readiness or job prep gap'
      nextStep = 'Check parts staging, truck stock, and pre-job preparation.'
      score += 1
    }

    if (
      challengeText.includes('customer') ||
      challengeText.includes('frustrated') ||
      challengeText.includes('upset')
    ) {
      situation = 'The job included customer-facing pressure'
      emotion = 'Likely felt tension while trying to manage both the work and the customer'
      rootCause = 'Customer expectation mismatch or communication strain'
      nextStep = 'Coach customer communication and set clearer expectations earlier in the job.'
      score += 1
    }

    if (
      challengeText.includes('communication') ||
      challengeText.includes('miscommunication') ||
      challengeText.includes('unclear') ||
      challengeText.includes("didn't know") ||
      challengeText.includes('did not know')
    ) {
      situation = 'The job appears to have been affected by communication gaps'
      emotion = 'Likely uncertain or unsupported in the moment'
      rootCause = 'Handoff or communication clarity issue'
      nextStep = 'Improve communication between dispatch, manager, and field technician.'
      score += 1
    }

    if (
      challengeText.includes('help') ||
      challengeText.includes('support') ||
      challengeText.includes('training') ||
      challengeText.includes('unsure') ||
      challengeText.includes('confidence')
    ) {
      situation = 'The technician appears to have needed more support on this job'
      emotion = 'Likely felt uncertain, stretched, or alone'
      rootCause = 'Coaching, confidence, or training gap'
      nextStep = 'Provide brief coaching, backup, or a quick review before similar jobs.'
      score += 1
    }

    if (
      challengeText.includes('tired') ||
      challengeText.includes('exhausted') ||
      challengeText.includes('burned out') ||
      challengeText.includes('burnout') ||
      challengeText.includes('fatigue') ||
      challengeText.includes('missed') ||
      challengeText.includes('family') ||
      challengeText.includes('kids') ||
      challengeText.includes('son') ||
      challengeText.includes('daughter') ||
      challengeText.includes('wife') ||
      challengeText.includes('home')
    ) {
      emotion = 'There are signs this strain may be affecting the technician personally'
      score += 2
    }

    if (
      winText.includes('smooth') ||
      winText.includes('confident') ||
      winText.includes('good') ||
      winText.includes('success') ||
      winText.includes('solved') ||
      winText.includes('finished') ||
      winText.includes('completed')
    ) {
      score -= 1
    }

    if (score >= 3) {
      riskLevel = 'High'
    } else if (score >= 1) {
      riskLevel = 'Medium'
    } else {
      riskLevel = 'Low'
    }

    return {
      situation,
      emotion,
      riskLevel,
      rootCause,
      nextStep,
    }
  }

  const buildSupportResponse = (
    technicianNameValue: string,
    interpretation: InterpretationResult
  ) => {
    const firstName = technicianNameValue.trim() || 'there'

    return `Thanks for sharing this, ${firstName}. It sounds like ${interpretation.situation.toLowerCase()} and that ${interpretation.emotion.toLowerCase()}. That is a real spot to be in, and it helps to capture it honestly. The next best step is to look at ${interpretation.rootCause.toLowerCase()} so the next job can feel smoother and better supported.`
  }

  const buildFrameworkManagerInsight = (
    jobTypeValue: string,
    interpretation: InterpretationResult,
    whatWentWellValue: string
  ) => {
    const wins = whatWentWellValue?.trim()
      ? whatWentWellValue.trim()
      : 'No specific win was entered.'

    return `Understanding Framework for ${jobTypeValue || 'Job'}:
Situation: ${interpretation.situation}.
Emotion: ${interpretation.emotion}.
Risk Level: ${interpretation.riskLevel}.
Root Cause Guess: ${interpretation.rootCause}.
What Went Well: ${wins}
Suggested Next Step: ${interpretation.nextStep}`
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
  const handleGenerateTeamSummary = async () => {
  setTeamSummaryLoading(true)
  setTeamSummaryError('')
  setTeamSummaryResult(null)

  if (!managerReflection.trim()) {
    setTeamSummaryError('Please enter a manager reflection first.')
    setTeamSummaryLoading(false)
    return
  }

  try {
    const res = await fetch('/api/team-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        managerReflection,
      }),
    })

    const data = await res.json()

    console.log('TEAM SUMMARY:', data)

    setTeamSummaryResult(data)
  } catch (err) {
    console.error('TEAM SUMMARY ERROR:', err)
    setTeamSummaryError('Failed to generate team summary.')
  }

  setTeamSummaryLoading(false)
  }
  

  

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setLoading(true)
  setMessage('')
  setAiResponse('')
  setBurnoutSignal('')
  setUnderstandingSnapshot(null)

  if (!technicianName || !jobType || !reflection) {
    setMessage('Please fill out name, job type, and reflection.')
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

  // ✅ CALL OPENAI
let generatedResponse = ''
let generatedManagerInsight = ''

try {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      technicianName,
      jobType,
      reflection,
    }),
  })

  const rawText = await res.text()

  console.log('API STATUS:', res.status)
  console.log('API RAW RESPONSE:', rawText)

  if (!res.ok) {
    setMessage(`AI route error: ${rawText}`)
    setLoading(false)
    return
  }

  let data: any

  try {
    data = JSON.parse(rawText)
  } catch {
    setMessage(`AI route returned invalid JSON: ${rawText}`)
    setLoading(false)
    return
  }

  console.log('AI RESPONSE:', data)

  generatedResponse = data.technician_response
  generatedManagerInsight = data.manager_insight

  if (!generatedResponse || !generatedManagerInsight) {
    setMessage(`AI route returned incomplete data: ${rawText}`)
    setLoading(false)
    return
  }
} catch (err) {
  console.error('AI FETCH ERROR:', err)
  setMessage('AI failed to generate response.')
  setLoading(false)
  return
}

// ✅ KEEP YOUR LOGIC (THIS IS GOOD)
const interpretation = interpretReflection(jobType, reflection, '', '')

const generatedBurnoutSignal =
  interpretation.riskLevel === 'High'
    ? 'High strain signal detected. A supportive manager check-in is recommended soon.'
    : interpretation.riskLevel === 'Medium'
    ? 'Moderate strain signal detected. Watch for repeated pressure and support needs.'
    : buildBurnoutSignal(reflection, '', '')

  // ✅ SAVE TO SUPABASE
  const { error } = await supabase.from('Reflections').insert([
    {
      technician_id: resolvedTechnician.technicianId,
      technician_name: resolvedTechnician.canonicalName,
      job_type: jobType,
      challenge: reflection,
      what_went_well: null,
      help_needed: null,
      ai_response: generatedResponse,
      manager_insight: generatedManagerInsight,
      created_at: new Date().toISOString(),
    },
  ])

  if (error) {
    setMessage(`Submit error: ${error.message}`)
  } else {
    setMessage('Reflection submitted.')
    setAiResponse(generatedResponse)
    setBurnoutSignal(generatedBurnoutSignal)
    setUnderstandingSnapshot(interpretation)

    setTechnicianName('')
    setJobType('')
    setReflection('')
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
      <div style={styles.shell}>
        <div style={styles.topHero}>
          <div>
            <div style={styles.kicker}>AI for Humans in the Trades</div>
            <h1 style={styles.heroTitle}>TradeWise</h1>
            <p style={styles.heroSubtitle}>
              A reflection and support system designed to help technicians feel heard, managers
              see patterns sooner, and teams grow with more empathy and clarity.
            </p>
          </div>

          <div style={styles.heroStatRow}>
            <div style={styles.heroStatCard}>
              <div style={styles.heroStatNumber}>{reflections.length}</div>
              <div style={styles.heroStatLabel}>Reflections Loaded</div>
            </div>
            <div style={styles.heroStatCard}>
              <div style={styles.heroStatNumber}>{technicians.length}</div>
              <div style={styles.heroStatLabel}>Known Technicians</div>
            </div>
          </div>
        </div>

        <div style={styles.container}>
          <div style={styles.header}>
            <div>
              <div style={styles.sectionEyebrow}>
                {view === 'tech' ? 'Technician Experience' : 'Manager Experience'}
              </div>
              <h2 style={styles.title}>
                {view === 'tech'
                  ? 'Daily reflection with guided support'
                  : 'Insights, trends, and technician follow-up'}
              </h2>
            </div>

            <div style={styles.toggleWrap}>
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
          </div>

          {view === 'tech' && (
            <div style={styles.techLayout}>
              <div style={styles.techLeft}>
                <div style={styles.wowCard}>
                  <div style={styles.wowBadge}>First WOW</div>
                  <h3 style={styles.wowTitle}>A technician can reflect in minutes.</h3>
                  <p style={styles.wowText}>
                    TradeWise captures what happened, what went well, and what support would have
                    helped — then interprets the moment and responds in a way that feels human
                    instead of cold.
                  </p>

                  <div style={styles.wowGrid}>
                    <div style={styles.miniInfoCard}>
                      <strong>Capture</strong>
                      <p style={styles.miniInfoText}>
                        Guided reflection collects what happened in the field.
                      </p>
                    </div>
                    <div style={styles.miniInfoCard}>
                      <strong>Interpret</strong>
                      <p style={styles.miniInfoText}>
                        TradeWise identifies the situation, emotion, risk, and likely root cause.
                      </p>
                    </div>
                    <div style={styles.miniInfoCard}>
                      <strong>Respond + Improve</strong>
                      <p style={styles.miniInfoText}>
                        Technicians get support while managers get a next step they can act on.
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} style={styles.formCard}>
                  <div style={styles.formHeader}>
                    <h3 style={{ margin: 0 }}>Submit Reflection</h3>
                    <span style={styles.formHeaderBadge}>Live Demo Flow</span>
                  </div>

                  <div style={styles.form}>
                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>Technician Name</label>
                      <input
                        list="technician-name-options"
                        placeholder="Technician Name"
                        value={technicianName}
                        onChange={(e) => setTechnicianName(e.target.value)}
                        style={styles.input}
                      />
                      <datalist id="technician-name-options">
                        {technicians.map((tech) => (
                          <option key={tech.id} value={tech.canonical_name} />
                        ))}
                      </datalist>

                      {speechSupported && (
                        <button
                          type="button"
                          onClick={() => startListening('technicianName')}
                          style={styles.micButton}
                        >
                          {isListening && activeField === 'technicianName'
                            ? 'Listening...'
                            : '🎤 Speak Name'}
                        </button>
                      )}
                    </div>

                    <div style={styles.fieldWrap}>
                      <label style={styles.label}>Job Type</label>
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
                        <button
                          type="button"
                          onClick={() => startListening('jobType')}
                          style={styles.micButton}
                        >
                          {isListening && activeField === 'jobType'
                            ? 'Listening...'
                            : '🎤 Speak Job Type'}
                        </button>
                      )}
                    </div>

                    {speechSupported && (
                      <div style={styles.guidedBox}>
                        <div style={styles.guidedHeader}>
                          <strong>Voice Reflection</strong>
                          <span style={styles.guidedBadge}>Guided</span>
                        </div>

                        <p style={styles.guidedText}>
                          Tap one button and TradeWise will guide the technician through name, job
                          type, job details, what went well, and what would have helped.
                        </p>

                        <div style={styles.guidedActions}>
                          <button
                            type="button"
                            onClick={startFullReflectionRecording}
                            style={styles.recordButton}
                            disabled={guidedRecording}
                          >
                            {guidedRecording
                              ? 'Recording in Progress...'
                              : '🎙️ Record Full Reflection'}
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
                                  : 'Reflection'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={styles.fieldWrap}>
  <label style={styles.label}>Reflection</label>
  <textarea
    placeholder="Talk like you normally would... what happened today?"
    value={reflection}
    onChange={(e) => setReflection(e.target.value)}
    style={styles.textarea}
  />
  {speechSupported && (
    <button
      type="button"
      onClick={() => startListening('reflection')}
      style={styles.micButton}
    >
      {isListening && activeField === 'reflection'
        ? 'Listening...'
        : '🎤 Speak Reflection'}
    </button>
  )}
</div>

                    

                    

                    {!speechSupported && (
                      <div style={styles.infoBox}>
                        Speech-to-text is not supported in this browser. Chrome usually works best.
                      </div>
                    )}

                    <button type="submit" style={styles.submit}>
                      {loading ? 'Submitting...' : 'Submit Reflection'}
                    </button>

                    {message && (
                      <div
                        style={
                          message === 'Reflection submitted.' ? styles.successBox : styles.warningBox
                        }
                      >
                        {message}
                      </div>
                    )}

                    {aiResponse && message === 'Reflection submitted.' && (
                      <div style={styles.aiResponseFeature}>
                        <div style={styles.aiResponseHeader}>
                          <div>
                            <div style={styles.aiLabel}>AI Response</div>
                            <h3 style={{ margin: '6px 0 0 0' }}>Technician Support Message</h3>
                          </div>
                          <span style={styles.aiBadge}>Empathy Layer</span>
                        </div>

                        <p style={styles.aiResponseText}>{aiResponse}</p>

                        {understandingSnapshot && (
                          <div style={styles.frameworkBox}>
                            <div style={styles.frameworkHeader}>
                              <div>
                                <div style={styles.frameworkLabel}>Understanding Framework</div>
                                <h3 style={{ margin: '6px 0 0 0' }}>Interpretation Snapshot</h3>
                              </div>
                              <span
                                style={
                                  understandingSnapshot.riskLevel === 'High'
                                    ? styles.riskHigh
                                    : understandingSnapshot.riskLevel === 'Medium'
                                    ? styles.riskMedium
                                    : styles.riskLow
                                }
                              >
                                {understandingSnapshot.riskLevel} Risk
                              </span>
                            </div>

                            <div style={styles.frameworkGrid}>
                              <div style={styles.frameworkItem}>
                                <strong>Situation</strong>
                                <p style={styles.frameworkText}>{understandingSnapshot.situation}</p>
                              </div>

                              <div style={styles.frameworkItem}>
                                <strong>Emotion</strong>
                                <p style={styles.frameworkText}>{understandingSnapshot.emotion}</p>
                              </div>

                              <div style={styles.frameworkItem}>
                                <strong>Root Cause Guess</strong>
                                <p style={styles.frameworkText}>
                                  {understandingSnapshot.rootCause}
                                </p>
                              </div>

                              <div style={styles.frameworkItem}>
                                <strong>Next Step</strong>
                                <p style={styles.frameworkText}>{understandingSnapshot.nextStep}</p>
                              </div>
                            </div>
                          </div>
                        )}

                        {burnoutSignal && (
                          <div style={styles.burnoutBox}>
                            <strong>Burnout Signal</strong>
                            <p style={{ margin: '8px 0 0 0' }}>{burnoutSignal}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </form>
              </div>

              <div style={styles.techRight}>
                <div style={styles.previewCard}>
                  <div style={styles.previewHeader}>
                    <h3 style={{ margin: 0 }}>What this gives a contractor</h3>
                  </div>

                  <div style={styles.previewList}>
                    <div style={styles.previewItem}>
                      <div style={styles.previewDot} />
                      <div>
                        <strong>Faster honesty from technicians</strong>
                        <p style={styles.previewItemText}>
                          A simple, non-threatening way for techs to share friction in the field.
                        </p>
                      </div>
                    </div>

                    <div style={styles.previewItem}>
                      <div style={styles.previewDot} />
                      <div>
                        <strong>Visible interpretation</strong>
                        <p style={styles.previewItemText}>
                          TradeWise turns a reflection into situation, emotion, risk, and likely
                          root cause.
                        </p>
                      </div>
                    </div>

                    <div style={styles.previewItem}>
                      <div style={styles.previewDot} />
                      <div>
                        <strong>A human-first signal system</strong>
                        <p style={styles.previewItemText}>
                          The goal is not just data collection. It is better coaching, healthier
                          culture, and stronger retention.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={styles.quoteCard}>
                  <div style={styles.quoteBadge}>Why it matters</div>
                  <p style={styles.quoteText}>
                    “When a technician feels understood, feedback stops feeling like punishment and
                    starts feeling like support.”
                  </p>
                </div>
              </div>
            </div>
          )}

          {view === 'manager' && (
            <div>
              <div style={styles.managerIntroCard}>
                <div>
                  <div style={styles.sectionEyebrow}>Manager Console</div>
                  <h2 style={{ margin: '4px 0 8px 0' }}>
                    Team visibility without losing the human side
                  </h2>
                  <p style={styles.overviewText}>
                    Review weekly patterns, open technician profiles, and add private manager notes
                    while keeping the system grounded in support instead of shame.
                  </p>
                </div>
              </div>

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
                      their individual weekly recap, and add private manager notes.
                    </p>
                  </div>

                  {technicianDirectory.length === 0 && <p>No technicians found yet.</p>}

                  <div style={styles.directoryGrid}>
                    {technicianDirectory.map((tech) => (
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

                        <p style={styles.techCardText}>
                          <strong>Manager Note:</strong>{' '}
                          {managerNotes[tech.name]?.note?.trim() ? 'Saved' : 'No private note yet'}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!loadingReflections && !managerError && managerScreen === 'profile' && (
                <div>
                  <div style={styles.profileHeaderCard}>
                    <div>
                      <h3 style={{ margin: 0 }}>{selectedTechnician || 'Technician Profile'}</h3>
                      <p style={{ marginTop: 8, marginBottom: 0, color: '#486581' }}>
                        Reflection history, weekly AI recap, and private manager notes
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
                      <p style={{ margin: '8px 0 0 0' }}>
                        {selectedTechnicianWeeklyRecap.managerFocus}
                      </p>
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
                    <div key={`${r.technician_name}-${r.created_at}-${index}`} style={styles.historyCard}>
                      <div style={styles.historyCardTop}>
                        <h3 style={{ margin: 0 }}>{r.technician_name}</h3>
                        <span style={styles.historyBadge}>{r.job_type}</span>
                      </div>

                      <p><strong>Challenge:</strong> {r.challenge}</p>
                      <p><strong>What Went Well:</strong> {r.what_went_well || 'No win entered.'}</p>
                      <p><strong>Help Needed:</strong> {r.help_needed || 'None provided'}</p>

                      <div style={styles.aiBox}>
                        <strong>Technician AI Response:</strong>
                        <p>{r.ai_response || 'No AI response saved.'}</p>
                      </div>

                      <div style={styles.managerInsightBox}>
                        <strong>Manager Insight:</strong>
                        <p style={{ whiteSpace: 'pre-wrap' }}>
                          {r.manager_insight || 'No manager insight saved.'}
                        </p>
                      </div>

                      <small>{new Date(r.created_at).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

const styles: any = {
  page: {
    minHeight: '100vh',
    background:
      'linear-gradient(180deg, #0f172a 0%, #10243f 18%, #eaf1f8 18%, #eef4fa 100%)',
    padding: '32px 18px 48px',
    fontFamily: 'Inter, Arial, Helvetica, sans-serif',
  },
  shell: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  topHero: {
    background:
      'linear-gradient(135deg, rgba(11,110,79,0.95) 0%, rgba(16,42,67,0.98) 70%)',
    color: '#fff',
    borderRadius: '24px',
    padding: '28px',
    marginBottom: '22px',
    display: 'grid',
    gridTemplateColumns: '1.4fr 0.8fr',
    gap: '20px',
    boxShadow: '0 22px 60px rgba(15, 23, 42, 0.28)',
  },
  kicker: {
    fontSize: '12px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    opacity: 0.8,
    marginBottom: '10px',
    fontWeight: 700,
  },
  heroTitle: {
    fontSize: '42px',
    lineHeight: 1,
    margin: '0 0 12px 0',
    fontWeight: 800,
  },
  heroSubtitle: {
    margin: 0,
    maxWidth: '720px',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 1.6,
    fontSize: '16px',
  },
  heroStatRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    alignSelf: 'end',
  },
  heroStatCard: {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '18px',
    padding: '18px',
    backdropFilter: 'blur(6px)',
  },
  heroStatNumber: {
    fontSize: '28px',
    fontWeight: 800,
    marginBottom: '6px',
  },
  heroStatLabel: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.82)',
  },
  container: {
    background: 'rgba(255,255,255,0.96)',
    borderRadius: '24px',
    padding: '28px',
    boxShadow: '0 18px 50px rgba(15, 23, 42, 0.08)',
    border: '1px solid rgba(216, 230, 245, 0.7)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    gap: '16px',
    flexWrap: 'wrap',
  },
  sectionEyebrow: {
    color: '#0b6e4f',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: '8px',
  },
  title: {
    margin: 0,
    color: '#102a43',
    fontSize: '28px',
    lineHeight: 1.2,
  },
  toggleWrap: {
    display: 'flex',
    alignItems: 'center',
  },
  toggle: {
    display: 'flex',
    gap: '10px',
    padding: '6px',
    background: '#eaf1f8',
    borderRadius: '14px',
  },
  btn: {
    padding: '12px 18px',
    background: 'transparent',
    color: '#486581',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '10px',
    fontWeight: 700,
  },
  activeBtn: {
    padding: '12px 18px',
    background: 'linear-gradient(135deg, #0b6e4f 0%, #12805e 100%)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '10px',
    fontWeight: 700,
    boxShadow: '0 8px 20px rgba(11,110,79,0.25)',
  },
  techLayout: {
    display: 'grid',
    gridTemplateColumns: '1.35fr 0.8fr',
    gap: '22px',
  },
  techLeft: {
    display: 'grid',
    gap: '18px',
  },
  techRight: {
    display: 'grid',
    gap: '18px',
    alignContent: 'start',
  },
  wowCard: {
    background: 'linear-gradient(180deg, #f8fcff 0%, #edf6ff 100%)',
    border: '1px solid #d7e8f8',
    borderRadius: '20px',
    padding: '22px',
  },
  wowBadge: {
    display: 'inline-block',
    background: '#102a43',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 800,
    marginBottom: '12px',
  },
  wowTitle: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    color: '#102a43',
  },
  wowText: {
    margin: '0 0 18px 0',
    color: '#486581',
    lineHeight: 1.6,
  },
  wowGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
  },
  miniInfoCard: {
    background: '#fff',
    border: '1px solid #dbe7f3',
    borderRadius: '14px',
    padding: '14px',
  },
  miniInfoText: {
    margin: '8px 0 0 0',
    color: '#486581',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  formCard: {
    background: '#ffffff',
    border: '1px solid #dde7f2',
    borderRadius: '20px',
    padding: '22px',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
  },
  formHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '18px',
  },
  formHeaderBadge: {
    background: '#e6f4ea',
    color: '#1e4620',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 800,
  },
  form: {
    display: 'grid',
    gap: '14px',
  },
  label: {
    fontSize: '13px',
    color: '#243b53',
    fontWeight: 700,
  },
  input: {
    padding: '14px 14px',
    borderRadius: '12px',
    border: '1px solid #cbd8e6',
    width: '100%',
    boxSizing: 'border-box',
    fontSize: '15px',
    background: '#fcfdff',
    color: '#102a43',
  },
  textarea: {
    padding: '14px',
    minHeight: '110px',
    borderRadius: '12px',
    border: '1px solid #cbd8e6',
    width: '100%',
    boxSizing: 'border-box',
    fontSize: '15px',
    background: '#fcfdff',
    color: '#102a43',
    resize: 'vertical',
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
    borderRadius: '10px',
    cursor: 'pointer',
    width: 'fit-content',
    fontWeight: 700,
  },
  guidedBox: {
    background: 'linear-gradient(180deg, #eef6ff 0%, #f8fbff 100%)',
    border: '1px solid #c9ddf5',
    padding: '18px',
    borderRadius: '16px',
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
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 700,
    boxShadow: '0 8px 18px rgba(11,110,79,0.2)',
  },
  cancelButton: {
    padding: '12px 14px',
    background: '#b42318',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  promptBox: {
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: '10px',
    padding: '14px',
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
    borderRadius: '10px',
  },
  submit: {
    padding: '14px 18px',
    background: 'linear-gradient(135deg, #0b6e4f 0%, #12805e 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: '15px',
    boxShadow: '0 10px 20px rgba(11,110,79,0.22)',
  },
  successBox: {
    background: '#eafaf0',
    border: '1px solid #bde3c7',
    color: '#1e4620',
    padding: '12px 14px',
    borderRadius: '12px',
    fontWeight: 700,
  },
  warningBox: {
    background: '#fff5f5',
    border: '1px solid #f0c9c9',
    color: '#7a1f1f',
    padding: '12px 14px',
    borderRadius: '12px',
    fontWeight: 700,
  },
  aiResponseFeature: {
    background: 'linear-gradient(180deg, #f7f1ff 0%, #ede3ff 100%)',
    border: '1px solid #d6c2ff',
    borderRadius: '18px',
    padding: '18px',
  },
  aiResponseHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: '12px',
  },
  aiLabel: {
    fontSize: '12px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#6b46c1',
  },
  aiBadge: {
    background: '#6b46c1',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
  },
  aiResponseText: {
    margin: 0,
    color: '#2d1b69',
    lineHeight: 1.7,
    fontSize: '15px',
  },
  frameworkBox: {
    marginTop: '16px',
    background: '#ffffff',
    border: '1px solid #d9c9ff',
    borderRadius: '16px',
    padding: '16px',
  },
  frameworkHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: '14px',
  },
  frameworkLabel: {
    fontSize: '12px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#5b3db3',
  },
  frameworkGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
  },
  frameworkItem: {
    background: '#f8f5ff',
    border: '1px solid #e2d8ff',
    borderRadius: '12px',
    padding: '12px',
  },
  frameworkText: {
    margin: '8px 0 0 0',
    color: '#2d1b69',
    lineHeight: 1.5,
    fontSize: '14px',
  },
  riskLow: {
    background: '#eafaf0',
    color: '#1e4620',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 800,
  },
  riskMedium: {
    background: '#fff4e5',
    color: '#8a5a00',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 800,
  },
  riskHigh: {
    background: '#fff1f1',
    color: '#a61b1b',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 800,
  },
  burnoutBox: {
    marginTop: '14px',
    background: '#fff4e5',
    border: '1px solid #f3c98b',
    color: '#7a4b00',
    padding: '14px',
    borderRadius: '12px',
  },
  previewCard: {
    background: '#ffffff',
    border: '1px solid #dde7f2',
    borderRadius: '20px',
    padding: '20px',
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
  },
  previewHeader: {
    marginBottom: '14px',
  },
  previewList: {
    display: 'grid',
    gap: '16px',
  },
  previewItem: {
    display: 'grid',
    gridTemplateColumns: '14px 1fr',
    gap: '12px',
    alignItems: 'start',
  },
  previewDot: {
    width: '10px',
    height: '10px',
    borderRadius: '999px',
    background: '#0b6e4f',
    marginTop: '6px',
  },
  previewItemText: {
    margin: '6px 0 0 0',
    color: '#486581',
    lineHeight: 1.6,
  },
  quoteCard: {
    background: 'linear-gradient(135deg, #102a43 0%, #163857 100%)',
    color: '#fff',
    borderRadius: '20px',
    padding: '22px',
  },
  quoteBadge: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.12)',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
    marginBottom: '12px',
  },
  quoteText: {
    margin: 0,
    fontSize: '18px',
    lineHeight: 1.7,
    color: 'rgba(255,255,255,0.95)',
  },
  managerIntroCard: {
    background: 'linear-gradient(180deg, #f8fbff 0%, #eef5fb 100%)',
    border: '1px solid #d8e6f5',
    padding: '20px',
    borderRadius: '18px',
    marginBottom: '18px',
  },
  managerNav: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '18px',
  },
  managerNavBtn: {
    padding: '11px 14px',
    background: '#d9e2ec',
    color: '#102a43',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  activeManagerNavBtn: {
    padding: '11px 14px',
    background: '#102a43',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 700,
    boxShadow: '0 10px 20px rgba(16,42,67,0.16)',
  },
  directoryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '14px',
  },
  technicianCard: {
    textAlign: 'left',
    border: '1px solid #d9e2ec',
    borderRadius: '16px',
    background: '#fff',
    padding: '18px',
    cursor: 'pointer',
    boxShadow: '0 8px 22px rgba(15, 23, 42, 0.04)',
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
  techCardText: {
    margin: '8px 0',
    color: '#243b53',
    lineHeight: 1.5,
  },
  profileHeaderCard: {
    background: '#f8fbff',
    border: '1px solid #d8e6f5',
    padding: '18px',
    borderRadius: '16px',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  backButton: {
    padding: '10px 12px',
    background: '#102a43',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  noteCard: {
    background: '#fffdf5',
    border: '1px solid #ead9a7',
    padding: '20px',
    borderRadius: '16px',
    marginBottom: '20px',
  },
  noteTextarea: {
    width: '100%',
    minHeight: '120px',
    padding: '12px',
    borderRadius: '12px',
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
    borderRadius: '10px',
    cursor: 'pointer',
    fontWeight: 700,
  },
  noteMeta: {
    color: '#486581',
    fontSize: '13px',
  },
  historyCard: {
    border: '1px solid #d9e2ec',
    padding: '18px',
    marginBottom: '14px',
    borderRadius: '16px',
    background: '#fff',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.04)',
  },
  historyCardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '12px',
  },
  historyBadge: {
    background: '#eef6ff',
    color: '#102a43',
    padding: '6px 10px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700,
  },
  aiBox: {
    background: '#f5f0ff',
    border: '1px solid #ddd0ff',
    padding: '12px',
    marginTop: '10px',
    borderRadius: '10px',
    color: '#35206b',
  },
  managerInsightBox: {
    background: '#eef9f1',
    border: '1px solid #bfdcca',
    padding: '12px',
    marginTop: '10px',
    borderRadius: '10px',
    color: '#1e4620',
  },
  errorBox: {
    background: '#fdecec',
    border: '1px solid #f3b9b9',
    color: '#7a1f1f',
    padding: '14px',
    borderRadius: '12px',
    marginBottom: '12px',
  },
  overviewCard: {
    background: '#f8fbff',
    border: '1px solid #d8e6f5',
    padding: '20px',
    borderRadius: '16px',
    marginBottom: '20px',
  },
  weeklyCard: {
    background: '#fff8ef',
    border: '1px solid #f1d1a8',
    padding: '20px',
    borderRadius: '16px',
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
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  },
  statBox: {
    background: '#fff',
    border: '1px solid #d9e2ec',
    borderRadius: '12px',
    padding: '16px',
  },
  statNumber: {
    fontSize: '30px',
    fontWeight: 800,
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
    lineHeight: 1.6,
  },
  actionBox: {
    background: '#e6f4ea',
    border: '1px solid #bfdcca',
    padding: '14px',
    borderRadius: '12px',
    marginTop: '8px',
    color: '#1e4620',
  },
}