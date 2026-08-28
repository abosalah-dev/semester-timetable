"""Turn a PDF page into rows of column-addressed text.

Both source files are fixed-column reports, but neither survives ordinary text
extraction:

* ``pdftotext -layout`` shifts day/time/room values onto neighbouring rows.
* Word-level extraction merges a course name that overflows into the next
  column with that column's value (``English for academic purpos``+``G``+``es``).

So we work from character positions. Characters are clustered into rows by
their vertical position and into words by horizontal gaps, then each word is
assigned to the column it overlaps most. When a column ends up empty because a
neighbouring word physically covers it, :func:`Row.slice_chars` recovers the
characters that actually sit inside that column's x-range.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import pdfplumber

#: Characters closer together than this belong to the same word. The reports
#: use a single space between words at roughly 2.5pt, so 1.2pt separates
#: "kerning" from "space" reliably in both files.
WORD_GAP = 1.2

#: Two characters whose vertical positions differ by less than this are on the
#: same printed line.
ROW_TOLERANCE = 1.5


@dataclass
class Word:
    text: str
    x0: float
    x1: float


@dataclass
class Column:
    name: str
    x0: float
    x1: float

    def overlap(self, word: Word) -> float:
        return max(0.0, min(self.x1, word.x1) - max(self.x0, word.x0))


@dataclass
class Row:
    page: int
    top: float
    words: list[Word]
    chars: list[dict] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)

    def cells(self, columns: list[Column]) -> dict[str, str]:
        """Assign each word to the column it overlaps most."""
        buckets: dict[str, list[Word]] = {c.name: [] for c in columns}
        for word in self.words:
            best = max(columns, key=lambda c: c.overlap(word))
            if best.overlap(word) > 0:
                buckets[best.name].append(word)
        return {
            name: " ".join(w.text for w in words).strip()
            for name, words in buckets.items()
        }

    def slice_chars(self, x0: float, x1: float) -> str:
        """Characters whose centre falls inside ``[x0, x1)``.

        This is the escape hatch for a value that has been swallowed by an
        overflowing neighbour: the characters are still at the right x
        positions even though word-splitting glued them to the wrong word.
        """
        return "".join(
            c["text"]
            for c in self.chars
            if x0 <= (c["x0"] + c["x1"]) / 2 < x1
        )


def read_rows(path) -> list[Row]:
    """Every printed line of the document, in reading order."""
    rows: list[Row] = []
    with pdfplumber.open(path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            rows.extend(_page_rows(page_number, page))
    return rows


def _page_rows(page_number: int, page) -> list[Row]:
    buckets: list[tuple[float, list[dict]]] = []
    for char in sorted(page.chars, key=lambda c: (c["top"], c["x0"])):
        for top, chars in buckets:
            if abs(char["top"] - top) <= ROW_TOLERANCE:
                chars.append(char)
                break
        else:
            buckets.append((char["top"], [char]))

    rows = []
    for top, chars in buckets:
        chars.sort(key=lambda c: c["x0"])
        words = _split_words(chars)
        if words:
            rows.append(Row(page=page_number, top=top, words=words, chars=chars))
    rows.sort(key=lambda r: r.top)
    return rows


def _split_words(chars: list[dict]) -> list[Word]:
    words: list[Word] = []
    text = ""
    x0 = x1 = 0.0
    for char in chars:
        if text and char["x0"] - x1 > WORD_GAP:
            words.append(Word(text.strip(), x0, x1))
            text = ""
        if not text:
            x0 = char["x0"]
        text += char["text"]
        x1 = char["x1"]
    if text.strip():
        words.append(Word(text.strip(), x0, x1))
    return [w for w in words if w.text]


def columns_from_header(row: Row, names: list[str]) -> list[Column]:
    """Build column ranges from a header line.

    ``names`` gives the semantic name for each header word, in order, so a
    header that prints ``Room`` twice can still yield ``room`` and
    ``room_capacity``. Each column runs from its own header word to the next
    one; the first extends to the left page edge and the last to the right,
    because report values are often printed slightly outside their heading.
    """
    if len(row.words) != len(names):
        raise ValueError(
            f"header has {len(row.words)} words, expected {len(names)}: {row.text!r}"
        )
    columns = []
    for index, (word, name) in enumerate(zip(row.words, names)):
        x0 = 0.0 if index == 0 else word.x0
        x1 = row.words[index + 1].x0 if index + 1 < len(names) else 1e9
        columns.append(Column(name=name, x0=x0, x1=x1))
    return columns


def collapse_spaces(value: str) -> str:
    """Report columns pad with runs of spaces; a name is one line of prose."""
    return re.sub(r"\s+", " ", value).strip()
