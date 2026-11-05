// پیوست مدرک مرخصی روی Supabase Storage — باکت خصوصی leave-attachments (مایگریشن ۰۰۰۸).
// مسیر: <hospital_id>/<employee_id>/<timestamp>-<filename>
import { supabase } from './supabaseClient';

const BUCKET = 'leave-attachments';

export async function uploadLeaveAttachment(file: File, hospitalId: string, employeeId: string): Promise<string> {
  const safeName = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_');
  const path = `${hospitalId}/${employeeId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw new Error(`آپلود پیوست ناموفق بود: ${error.message}`);
  return path;
}

/** لینک امضاشدهٔ یک‌ساعته برای مشاهدهٔ مدرک (فقط اعضای همان بیمارستان طبق RLS استوریج). */
export async function getLeaveAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error('ساخت لینک مشاهدهٔ مدرک ناموفق بود');
  return data.signedUrl;
}
