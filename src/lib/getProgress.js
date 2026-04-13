import { supabase } from './supabaseClient';

export async function getProgress(prolificId) {
  const { data, error } = await supabase
    .rpc('get_progress', { p_prolific_pid: prolificId });

  if (error) {
    console.error('getProgress error:', JSON.stringify(error));
    return 0;
  }

  return data ?? 0;
}