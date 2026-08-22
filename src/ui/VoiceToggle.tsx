import { useState } from 'react'
import { initAudio } from '../engine/audio'
import {
  sampleTimeCall,
  sampleVoice,
  setTimeCallsEnabled,
  setVoiceEnabled,
  timeCallsEnabled,
  voiceEnabled,
} from '../engine/speech'

function Option({
  checked,
  onChange,
  name,
  hint,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  name: string
  hint: string
}) {
  return (
    <label className="voice-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="voice-toggle-body">
        <span className="voice-toggle-name">{name}</span>
        <span className="voice-toggle-hint">{hint}</span>
      </span>
    </label>
  )
}

/**
 * The two sound options, both opt-in and independent of each other — numbers
 * without the phase words is a real combination for a group workout, where the
 * clock is across the room and only the time matters.
 *
 * Switching one on plays a word from it, which doubles as a preview of the
 * voice and as the gesture that unlocks audio for the session.
 */
export function VoiceToggle() {
  const [voice, setVoice] = useState(voiceEnabled)
  const [calls, setCalls] = useState(timeCallsEnabled)
  return (
    <div className="voice-toggles">
      <Option
        checked={voice}
        onChange={(on) => {
          setVoiceEnabled(on)
          setVoice(on)
          if (on) void initAudio().then(sampleVoice)
        }}
        name="Voice announcements"
        hint="Names each interval as it starts, and what's next at a rest."
      />
      <Option
        checked={calls}
        onChange={(on) => {
          setTimeCallsEnabled(on)
          setCalls(on)
          if (on) void initAudio().then(sampleTimeCall)
        }}
        name="Time calls"
        hint="Counts the time out loud as you work."
      />
    </div>
  )
}
