import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classifyReason, REASON_LABELS } from './reasons.js';

describe('classifyReason', () => {
  it.each([
    ['Vize sınavım vardı.', 'lessons_exams'],
    ['Hastaydım, ateşim vardı', 'health'],
    ['Aynı saatte başka bir etkinlik vardı', 'schedule_conflict'],
    ['Otobüsü kaçırdım', 'transport'],
    ['Tamamen unuttum', 'forgot'],
    ['Çok yağmur yağıyordu', 'weather'],
    ['Akşam işim vardı', 'work_family'],
    ['Artık ilgimi çekmedi', 'lost_interest'],
    ['SINAV HAFTASIYDI', 'lessons_exams'],
    ['Bilmiyorum', 'other'],
  ])('labels %j as %s', (answer, label) => {
    expect(classifyReason(answer)).toBe(label);
  });

  it('always returns a known label and ignores letter case', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (answer) => {
        const label = classifyReason(answer);
        expect(Object.keys(REASON_LABELS)).toContain(label);
        expect(classifyReason(answer.toLocaleUpperCase('tr'))).toBe(
          classifyReason(answer.toLocaleLowerCase('tr')),
        );
      }),
    );
  });
});
