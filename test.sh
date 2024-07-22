#!/bin/sh

cd $(realpath $(dirname "$0"))

if [ -d output ]; then
	rm -r output
fi

mkdir output

node cli.js build \
	-d "fixtures/data.yml" \
	-t fixtures/template.liquid \
	-o "output/yml.pdf"
