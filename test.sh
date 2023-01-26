#!/bin/sh

cd $(realpath $(dirname "$0"))

if [ -d output ]; then
  rm -r output
fi

mkdir output

formats="yml json jsonc json5"
for format in $formats; do
  node cli.js build \
    -d "fixtures/data.$format" \
    -t fixtures/template.liquid \
    -o "output/$format.pdf"
done
