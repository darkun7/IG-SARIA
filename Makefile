NAME      := IG-SARIA
VERSION   := $(shell node -p "require('./manifest.json').version" 2>/dev/null || echo 0.0.0)
DIST      := dist
ZIP       := $(DIST)/$(NAME)-$(VERSION).zip

SRC       := manifest.json background.js content.js i18n.js popup.html popup.css popup.js dashboard.html dashboard.css dashboard.js logo-saria.png favicon.ico README.md

.PHONY: all build check clean distclean

all: build

# Validate manifest JSON and JS syntax
check:
	@echo "==> Validating manifest.json"
	node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('    manifest OK')"
	@echo "==> Checking JS syntax"
	node --check background.js
	node --check content.js
	node --check i18n.js
	node --check popup.js
	node --check dashboard.js
	@echo "    JS OK"

# Build distributable zip into dist/
build: check
	@echo "==> Building $(NAME) v$(VERSION)"
	@mkdir -p $(DIST)
	@rm -f $(ZIP)
	@if command -v zip >/dev/null 2>&1; then \
		cd "$(CURDIR)" && zip -r "$(ZIP)" $(SRC) >/dev/null; \
	elif command -v python >/dev/null 2>&1; then \
		python -c "import shutil,sys; shutil.make_archive('$(DIST)/$(NAME)-$(VERSION)', 'zip', '.', '.', lambda n: (sys.stdout.write('    + ' + n + '\n'), True)[1] if any(n == f for f in '$(SRC)'.split()) else None)"; \
	else \
		echo "!! Need 'zip' or 'python' on PATH to build."; exit 1; \
	fi
	@echo "    Built: $(ZIP)"

clean:
	rm -rf $(DIST)

distclean: clean
	@echo "    Cleaned."
