// In non-leap years, February 29 birthdays are remembered on February 28.
export function birthdayFallsOn(month: number | undefined, day: number | undefined, date: Date): boolean {
  if (!month || !day) return false
  const observedDay = month === 2 && day === 29 && new Date(date.getFullYear(), 1, 29).getMonth() !== 1 ? 28 : day
  return month === date.getMonth() + 1 && observedDay === date.getDate()
}
