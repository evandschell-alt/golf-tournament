-- Add stroke index (hole handicap ranking 1-18) to holes table.
-- Stroke index determines which holes receive handicap strokes:
-- 1 = hardest hole, 18 = easiest.

alter table holes
  add column if not exists stroke_index integer
    check (stroke_index >= 1 and stroke_index <= 18);

create unique index if not exists holes_course_stroke_index_uniq
  on holes (course_id, stroke_index)
  where stroke_index is not null;
