const shortDate = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
const clock = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour:'2-digit', minute:'2-digit', hourCycle:'h23' });

export function shortStamp(iso: string) {
  return shortDate.format(new Date(iso)) + ' ' + clock.format(new Date(iso));
}

export function timeOfDay(iso: string) {
  return clock.format(new Date(iso));
}
