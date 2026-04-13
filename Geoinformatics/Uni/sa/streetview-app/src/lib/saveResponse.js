import { supabase } from './supabaseClient';

export async function saveResponse({
  prolificId, studyId, sessionId,
  shown, answers,
  questionTimesMs,
  totalViewingTimeMs,
  viewingTimeLeftMs,
  viewingTimeRightMs,
  decisionTimeMs,
  totalTimeMs,
  roundIndex
}) {
  const rows = Object.entries(answers).map(([question, chosen]) => ({
    prolific_pid: prolificId,
    study_id: studyId,
    session_id: sessionId,
    shown,
    question,
    chosen,
    question_time_ms: questionTimesMs?.[question] ?? null,
    total_viewing_time_ms: totalViewingTimeMs,
    viewing_time_left_ms: viewingTimeLeftMs,
    viewing_time_right_ms: viewingTimeRightMs,
    decision_time_ms: decisionTimeMs,
    total_time_ms: totalTimeMs,
    round_index: roundIndex,
    completed_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('survey_responses')
    .insert(rows, { ignoreDuplicates: true });
  if (error) console.error('Save error:', JSON.stringify(error));
}