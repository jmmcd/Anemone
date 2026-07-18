#!/usr/bin/env bash
#
# png2gif.sh — build a looping GIF from a set of PNG frames using ffmpeg.
#
# Uses ffmpeg's two-pass palettegen/paletteuse (a per-clip 256-colour palette),
# which gives much cleaner results than a single-pass GIF — important for the
# smooth colour gradients in the Anemone / ant-rendering frames.
#
# Usage:
#   scripts/png2gif.sh [-f FPS] [-w WIDTH] [-o OUT] [-d DITHER] INPUT
#
#   INPUT   A directory of PNGs, OR a printf-style pattern (frame_%03d.png),
#           OR a glob in quotes ('frames/*.png'). Frames are used in sorted order.
#   -f FPS  Frames per second (default 12).
#   -w W    Scale output to width W px, preserving aspect (default: source size).
#   -o OUT  Output file (default: logo.gif next to the input).
#   -d D    Dither: sierra2_4a (default), bayer, none. 'none' = flat/posterised.
#
# Examples:
#   scripts/png2gif.sh frames/                    # all PNGs in frames/, 12 fps
#   scripts/png2gif.sh -f 20 -w 480 -o logo.gif frames/
#   scripts/png2gif.sh 'renders/ant_*.png'        # a quoted glob
#
set -euo pipefail

FPS=12
WIDTH=""
OUT=""
DITHER="sierra2_4a"

while getopts "f:w:o:d:h" opt; do
    case "$opt" in
        f) FPS="$OPTARG" ;;
        w) WIDTH="$OPTARG" ;;
        o) OUT="$OPTARG" ;;
        d) DITHER="$OPTARG" ;;
        h) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Try -h for help." >&2; exit 2 ;;
    esac
done
shift $((OPTIND - 1))

if [ $# -lt 1 ]; then
    echo "error: no INPUT given. Try -h for help." >&2
    exit 2
fi
INPUT="$1"

command -v ffmpeg >/dev/null 2>&1 || { echo "error: ffmpeg not found on PATH." >&2; exit 1; }

# Resolve INPUT into an ffmpeg input. Three accepted forms:
#   1. a directory            → concat every *.png inside, sorted
#   2. a printf pattern (%0Nd) → ffmpeg's native numbered-sequence reader
#   3. a shell glob            → concat the matched files, sorted
CONCAT_LIST=""
cleanup() { [ -n "$CONCAT_LIST" ] && rm -f "$CONCAT_LIST"; }
trap cleanup EXIT

build_concat() {  # $@ = frame files, in order
    CONCAT_LIST="$(mktemp -t png2gif.XXXXXX)"
    for f in "$@"; do
        # ffconcat needs absolute paths (or paths relative to the list file).
        printf "file '%s'\n" "$(cd "$(dirname "$f")" && pwd)/$(basename "$f")" >> "$CONCAT_LIST"
    done
}

if [ -d "$INPUT" ]; then
    # shellcheck disable=SC2231
    frames=( "$INPUT"/*.png "$INPUT"/*.PNG )
    frames=( $(printf '%s\n' "${frames[@]}" | grep -v '\*' | sort) )
    [ ${#frames[@]} -gt 0 ] || { echo "error: no PNGs in $INPUT" >&2; exit 1; }
    build_concat "${frames[@]}"
    INPUT_ARGS=(-f concat -safe 0 -r "$FPS" -i "$CONCAT_LIST")
    DEFAULT_OUT="$INPUT/logo.gif"
elif printf '%s' "$INPUT" | grep -q '%[0-9]*d'; then
    INPUT_ARGS=(-framerate "$FPS" -i "$INPUT")
    DEFAULT_OUT="$(dirname "$INPUT")/logo.gif"
else
    # Treat as a glob (expanded by the caller's shell, or literally here).
    frames=( $(printf '%s\n' $INPUT | sort) )
    [ ${#frames[@]} -gt 0 ] || { echo "error: no files match $INPUT" >&2; exit 1; }
    build_concat "${frames[@]}"
    INPUT_ARGS=(-f concat -safe 0 -r "$FPS" -i "$CONCAT_LIST")
    DEFAULT_OUT="$(dirname "${frames[0]}")/logo.gif"
fi

OUT="${OUT:-$DEFAULT_OUT}"

# Filtergraph: optional scale → split → palettegen / paletteuse (two-pass).
SCALE=""
[ -n "$WIDTH" ] && SCALE="scale=${WIDTH}:-1:flags=lanczos,"
FILTER="${SCALE}split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=${DITHER}"

echo "Building $OUT  (fps=$FPS${WIDTH:+, width=$WIDTH}, dither=$DITHER)…"
ffmpeg -y "${INPUT_ARGS[@]}" -filter_complex "$FILTER" -loop 0 "$OUT"
echo "Done → $OUT"
