const fs = require('fs');
let code = fs.readFileSync('components/AuthLandingPage.tsx', 'utf8');

const anchorPoint = `<a\n                  key={item.label}`;

const injection = `<div className="flex items-center justify-center lg:ml-2">
              <LanguageSwitch className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] text-[#273249] transition-colors hover:bg-white/64 hover:text-blue-600" isDesktop={true} />
            </div>\n          </nav>`;

code = code.replace("</nav>", injection);
fs.writeFileSync('components/AuthLandingPage.tsx', code);
