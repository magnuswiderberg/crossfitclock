import { useState } from 'react'
import { initAudio } from '../engine/audio'
import { sampleVoice, setVoiceEnabled, voiceEnabled } from '../engine/speech'

/** Opt-in checkbox for voice announcements. */
export function VoiceToggle() {
  const [on, setOn] = useState(voiceEnabled)
  return (
    <label className="voice-toggle">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setVoiceEnabled(e.target.checked)
          setOn(e.target.checked)
          // The sample doubles as the gesture that unlocks audio, and as a
          // preview of the voice the session will actually use.
          if (e.target.checked) void initAudio().then(sampleVoice)
        }}
      />
      Voice announcements
    </label>
  )
}
