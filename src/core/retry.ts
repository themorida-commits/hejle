/**
 * ابزار تلاش مجدد با استراتژی عقب‌گرد نمایی
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    
    console.warn(`تلاش مجدد باقی‌مانده: ${retries}. در حال انتظار برای ${delay} میلی‌ثانیه...`);
    
    await new Promise((resolve) => setTimeout(resolve, delay));
    
    // تکرار با دو برابر کردن زمان انتظار
    return withRetry(fn, retries - 1, delay * 2);
  }
}
