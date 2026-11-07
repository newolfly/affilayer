#!/bin/bash
# For each URL: status, bytes, title, visible-text length
> results.tsv
while IFS= read -r url; do
  tmp=$(mktemp)
  code=$(curl -s -m 30 -o "$tmp" -w "%{http_code}" -L "$url")
  bytes=$(wc -c < "$tmp")
  title=$(grep -o '<title>[^<]*</title>' "$tmp" | head -1 | sed 's/<[^>]*>//g')
  # visible text: strip tags/scripts/styles, count chars
  textlen=$(sed -e 's/<script[^>]*>.*<\/script>//g' -e 's/<style[^>]*>.*<\/style>//g' "$tmp" | sed 's/<[^>]*>//g' | tr -d ' \n\t\r' | wc -c)
  echo -e "${code}\t${bytes}\t${textlen}\t${title}\t${url}" >> results.tsv
  rm -f "$tmp"
done < urls.txt
echo "done"
