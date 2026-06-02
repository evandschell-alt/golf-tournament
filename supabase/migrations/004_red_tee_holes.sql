-- Add separate par and stroke index for red tees.
-- Red tees are used for R3 scramble. The default par/stroke_index
-- columns continue to serve R1 (white) and R2 (blue) tees.

alter table holes
  add column if not exists par_red integer
    check (par_red >= 3 and par_red <= 6);

alter table holes
  add column if not exists stroke_index_red integer
    check (stroke_index_red >= 1 and stroke_index_red <= 18);

create unique index if not exists holes_course_stroke_index_red_uniq
  on holes (course_id, stroke_index_red)
  where stroke_index_red is not null;
