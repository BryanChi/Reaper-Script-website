-- @description Cool Reaper Scripts Installer
-- @version 2.0.0
-- @author bryan
-- @about
--   Installs Cool Reaper Scripts (Vertical FX List, ...) into REAPER from coolreaperscripts.com.
--   Pick the scripts and install; each script starts a free trial or asks for your license when
--   it first runs. Run it again any time to update or reinstall.
-- @changelog
--   2.0.0: downloads from coolreaperscripts.com (no key needed for released versions), new window,
--          dependency check, version picker, fills in your license for the installed scripts.

local r = reaper

local SITE = 'https://www.coolreaperscripts.com'
local API = SITE .. '/api/scripts'
local VERIFY_URL = SITE .. '/api/license/verify'
local EXT = 'CoolReaperScripts_Installer'

local OS = r.GetOS()
local IS_WIN = OS:match('Win') ~= nil
local SEP = IS_WIN and '\\' or '/'
local RES = r.GetResourcePath()

---------------------------------------------------------------------------------------------------
-- Opening links
---------------------------------------------------------------------------------------------------

local function OpenUrl(url)
  if r.CF_ShellExecute then r.CF_ShellExecute(url) return end
  if IS_WIN then r.ExecProcess('cmd.exe /C start "" "' .. url .. '"', -1)
  elseif OS:match('OSX') or OS:match('macOS') then os.execute('open "' .. url .. '"')
  else os.execute('xdg-open "' .. url .. '"') end
end


---------------------------------------------------------------------------------------------------
-- Files and processes
---------------------------------------------------------------------------------------------------

local function TempDir()
  local d = IS_WIN and (os.getenv('TEMP') or os.getenv('TMP')) or os.getenv('TMPDIR')
  if not d or d == '' then d = RES end
  return (d:gsub('[/\\]+$', ''))
end

local nonce = 0
local function TempFile(name)
  nonce = nonce + 1
  return TempDir() .. SEP .. string.format('crs_%x%x_%d_%s', os.time() % 0xFFFFFF, math.floor(os.clock() * 1e6) % 0xFFFFFF, nonce, name)
end

local function ShellQuote(s) return "'" .. tostring(s):gsub("'", "'\\''") .. "'" end

local function ReadFile(p)
  local f = io.open(p, 'rb')
  if not f then return nil end
  local d = f:read('*a')
  f:close()
  return d
end

local function WriteFile(p, data)
  local f = io.open(p, 'wb')
  if not f then return false end
  f:write(data)
  f:close()
  return true
end

local function Exists(p)
  local f = io.open(p, 'rb')
  if f then f:close() return true end
  return false
end

local function DirOf(p) return p:match('^(.*)[/\\][^/\\]*$') end

local function NativePath(p) return (p:gsub('/', SEP)) end

---------------------------------------------------------------------------------------------------
-- JSON (just enough for the site's answers)
---------------------------------------------------------------------------------------------------

local function JsonEncode(v)
  local t = type(v)
  if t == 'table' then
    local parts = {}
    for k, x in pairs(v) do parts[#parts + 1] = JsonEncode(tostring(k)) .. ':' .. JsonEncode(x) end
    return '{' .. table.concat(parts, ',') .. '}'
  elseif t == 'string' then
    return '"' .. v:gsub('[%c"\\]', function(c)
      local m = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
      return m[c] or string.format('\\u%04x', c:byte())
    end) .. '"'
  elseif t == 'number' or t == 'boolean' then
    return tostring(v)
  end
  return 'null'
end

local function JsonDecode(s)
  local i = 1
  local function ws() i = s:find('[^ \t\r\n]', i) or #s + 1 end
  local val
  local function str()
    i = i + 1
    local out = {}
    while true do
      local c = s:sub(i, i)
      if c == '' then error('unterminated string') end
      if c == '"' then i = i + 1 break end
      if c == '\\' then
        local e = s:sub(i + 1, i + 1)
        local m = { b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }
        if e == 'u' then
          local cp = tonumber(s:sub(i + 2, i + 5), 16) or 63
          out[#out + 1] = utf8.char(cp)
          i = i + 6
        else
          out[#out + 1] = m[e] or e
          i = i + 2
        end
      else
        local j = s:find('["\\]', i) or #s + 1
        out[#out + 1] = s:sub(i, j - 1)
        i = j
      end
    end
    return table.concat(out)
  end
  function val()
    ws()
    local c = s:sub(i, i)
    if c == '{' then
      i = i + 1
      local o = {}
      ws()
      if s:sub(i, i) == '}' then i = i + 1 return o end
      while true do
        ws()
        local k = str()
        ws()
        i = i + 1 -- :
        o[k] = val()
        ws()
        local d = s:sub(i, i)
        i = i + 1
        if d == '}' then return o end
      end
    elseif c == '[' then
      i = i + 1
      local a = {}
      ws()
      if s:sub(i, i) == ']' then i = i + 1 return a end
      while true do
        a[#a + 1] = val()
        ws()
        local d = s:sub(i, i)
        i = i + 1
        if d == ']' then return a end
      end
    elseif c == '"' then
      return str()
    elseif s:sub(i, i + 3) == 'true' then i = i + 4 return true
    elseif s:sub(i, i + 4) == 'false' then i = i + 5 return false
    elseif s:sub(i, i + 3) == 'null' then i = i + 4 return nil
    else
      local num = s:match('^-?%d+%.?%d*[eE]?[-+]?%d*', i)
      if not num or num == '' then error('bad json at ' .. i) end
      i = i + #num
      return tonumber(num)
    end
  end
  local ok, res = pcall(val)
  if ok then return res end
  return nil
end

---------------------------------------------------------------------------------------------------
-- HTTP: POST a JSON body with curl (built into macOS and Windows 10+)
-- Returns http code (number or nil), response text (when outPath is nil), error text
---------------------------------------------------------------------------------------------------

local function Post(url, body, outPath)
  local bodyFile = TempFile('body.json')
  if not WriteFile(bodyFile, JsonEncode(body)) then return nil, nil, 'Could not write to the temp folder' end
  local out = outPath or TempFile('out.txt')
  local code, err
  if IS_WIN then
    local res = r.ExecProcess(string.format(
      'curl -sS -L --max-time 90 -X POST -H "Content-Type: application/json" --data-binary "@%s" -o "%s" -w "%%{http_code}" "%s"',
      bodyFile, out, url), 100000)
    local exit, printed = (res or ''):match('^(%-?%d+)\n(.*)$')
    code = tonumber((printed or ''):match('(%d%d%d)%s*$'))
    if not code then err = (printed and printed ~= '' and printed) or ('curl exit ' .. tostring(exit)) end
  else
    local codeFile, errFile, sh = TempFile('code.txt'), TempFile('err.txt'), TempFile('run.sh')
    WriteFile(sh, string.format("#!/bin/sh\n/usr/bin/curl -sS -L --max-time 90 -X POST -H %s --data-binary @%s -o %s -w '%%{http_code}' %s > %s 2> %s\n",
      ShellQuote('Content-Type: application/json'), ShellQuote(bodyFile), ShellQuote(out), ShellQuote(url),
      ShellQuote(codeFile), ShellQuote(errFile)))
    os.execute('/bin/sh ' .. ShellQuote(sh))
    code = tonumber((ReadFile(codeFile) or ''):match('(%d%d%d)'))
    err = ReadFile(errFile)
    os.remove(codeFile) os.remove(errFile) os.remove(sh)
  end
  os.remove(bodyFile)
  local text
  if not outPath then
    text = ReadFile(out)
    os.remove(out)
  end
  if code == 0 then code = nil end
  return code, text, err
end

-- JSON request; returns the decoded answer or nil + a message for people
local function Api(url, body)
  local code, text, err = Post(url, body)
  if not code then return nil, 'Couldn\'t reach coolreaperscripts.com. Check your internet connection.' .. (err and ('\n' .. err:sub(1, 200)) or '') end
  local data = text and JsonDecode(text)
  if type(data) ~= 'table' then return nil, 'The server sent an unexpected answer (HTTP ' .. code .. ').' end
  if code >= 400 or data.ok == false then return nil, data.error or data.reason or ('HTTP ' .. code), data end
  return data
end

---------------------------------------------------------------------------------------------------
-- Free REAPER extensions the scripts need. Official builds are downloaded from their authors'
-- release pages into UserPlugins; REAPER loads them after a restart.
---------------------------------------------------------------------------------------------------

-- Download url to path (follows redirects); true when it got a non-empty file with HTTP 200
local function Get(url, path)
  local tmp = path .. '.download'
  os.remove(tmp)
  local code
  if IS_WIN then
    local res = r.ExecProcess(string.format('curl -sS -L -f --max-time 120 -o "%s" -w "%%{http_code}" "%s"', tmp, url), 130000)
    code = tonumber((res or ''):match('(%d%d%d)%s*$'))
  else
    local codeFile, sh = TempFile('code.txt'), TempFile('get.sh')
    WriteFile(sh, string.format("#!/bin/sh\n/usr/bin/curl -sS -L -f --max-time 120 -o %s -w '%%{http_code}' %s > %s 2>/dev/null\n",
      ShellQuote(tmp), ShellQuote(url), ShellQuote(codeFile)))
    os.execute('/bin/sh ' .. ShellQuote(sh))
    code = tonumber((ReadFile(codeFile) or ''):match('(%d%d%d)'))
    os.remove(codeFile) os.remove(sh)
  end
  local f = io.open(tmp, 'rb')
  local size = f and f:seek('end') or 0
  if f then f:close() end
  if code == 200 and size > 0 then
    os.remove(path)
    if os.rename(tmp, path) then return true end
    os.remove(tmp)
    return false, 'could not write ' .. path .. ' (is REAPER using it?)'
  end
  os.remove(tmp)
  return false, (code == 200 and 'empty download') or (code and ('HTTP ' .. code)) or 'no connection'
end

-- This REAPER's build: asset suffix used by ReaPack, ReaImGui and SWS releases, and ReaPack's
-- platform names (most specific first) for packages listed in a ReaPack index
local function Platform()
  local os_, app = r.GetOS(), (r.GetAppVersion() or ''):lower()
  if IS_WIN then
    if app:find('arm64ec') then return { arch = 'arm64ec', fallback = 'x64', ext = 'dll', names = { 'windows-arm64ec', 'win64', 'windows', 'win' } } end
    if os_ == 'Win32' then return { arch = 'x86', ext = 'dll', names = { 'win32', 'windows', 'win' } } end
    return { arch = 'x64', ext = 'dll', names = { 'win64', 'windows', 'win' } }
  elseif os_:match('OSX') or os_:match('macOS') then
    if os_:find('arm64') or app:find('arm64') then return { arch = 'arm64', ext = 'dylib', names = { 'darwin-arm64', 'darwin' } } end
    if os_ == 'OSX32' then return { arch = 'i386', ext = 'dylib', names = { 'darwin32', 'darwin' } } end
    return { arch = 'x86_64', ext = 'dylib', names = { 'darwin64', 'darwin' } }
  end
  if app:find('aarch64') or app:find('arm64') then return { arch = 'aarch64', ext = 'so', names = { 'linux-aarch64', 'linux' } } end
  if app:find('armv7') then return { arch = 'armv7l', ext = 'so', names = { 'linux-armv7l', 'linux' } } end
  if app:find('i686') then return { arch = 'i686', ext = 'so', names = { 'linux32', 'linux' } } end
  return { arch = 'x86_64', ext = 'so', names = { 'linux64', 'linux-x86_64', 'linux' } }
end

-- Newest build of a package listed in a ReaPack index (only the extension binary)
local function FromReaPackIndex(indexUrl, package, plat)
  local idx = TempFile('index.xml')
  local ok, err = Get(indexUrl, idx)
  local xml = ok and ReadFile(idx)
  os.remove(idx)
  if not xml then return nil, err end
  local s = xml:find('<reapack name="' .. package .. '"', 1, true)
  if not s then return nil, package .. ' not listed' end
  local block = xml:sub(s, (xml:find('</reapack>', s, true) or #xml))
  local last
  for v in block:gmatch('<version.-</version>') do last = v end -- versions are listed oldest first
  if not last then return nil, 'no versions of ' .. package end
  for rank, name in ipairs(plat.names) do
    for attrs, url in last:gmatch('<source([^>]*)>([^<]+)</source>') do
      local p = attrs:match('platform="([^"]+)"') or 'all'
      local file = attrs:match('file="([^"]+)"') or url:match('([^/]+)$')
      if p == name and file:match('%.' .. plat.ext .. '$') then
        return { url = url:gsub('&amp;', '&'), file = file:match('([^/\\]+)$') }
      end
    end
  end
  return nil, 'no build of ' .. package .. ' for this computer'
end

local EXTENSIONS = {
  { name = 'ReaPack', why = 'installs and updates REAPER add-ons',
    loaded = function() return r.ReaPack_BrowsePackages ~= nil end,
    asset = 'https://github.com/cfillion/reapack/releases/latest/download/reaper_reapack-%s.%s', hasArm64ec = true },
  { name = 'ReaImGui', why = 'draws the scripts\' windows',
    loaded = function() return r.ImGui_GetBuiltinPath ~= nil end,
    asset = 'https://github.com/cfillion/reaimgui/releases/latest/download/reaper_imgui-%s.%s' },
  { name = 'js_ReaScriptAPI', why = 'mouse and window helpers',
    loaded = function() return r.JS_Window_Find ~= nil end,
    index = 'https://github.com/ReaTeam/Extensions/raw/master/index.xml', package = 'js_ReaScriptAPI.ext' },
  { name = 'SWS Extension', why = 'extra track and send functions',
    loaded = function() return r.CF_ShellExecute ~= nil or r.BR_GetSetTrackSendInfo ~= nil end,
    asset = 'https://github.com/reaper-oss/sws/releases/latest/download/reaper_sws-%s.%s' },
}

local function MissingExtensions()
  local list = {}
  for _, e in ipairs(EXTENSIONS) do
    if not e.loaded() then list[#list + 1] = e end
  end
  return list
end

-- Installs the given extensions; returns names installed and { name, why } failures
local function InstallExtensions(list)
  local plat = Platform()
  local dir = RES .. SEP .. 'UserPlugins'
  r.RecursiveCreateDirectory(dir, 0)
  local done, failed = {}, {}
  for _, e in ipairs(list) do
    local url, file, err
    if e.asset then
      local arch = (plat.arch == 'arm64ec' and not e.hasArm64ec) and plat.fallback or plat.arch
      url = e.asset:format(arch, plat.ext)
      file = url:match('([^/]+)$')
    else
      local found
      found, err = FromReaPackIndex(e.index, e.package, plat)
      if found then url, file = found.url, found.file end
    end
    local ok = false
    if url then ok, err = Get(url, dir .. SEP .. file) end
    if ok then done[#done + 1] = e.name else failed[#failed + 1] = { name = e.name, why = err or 'download failed' } end
  end
  return done, failed
end

local function ExtensionReport(done, failed)
  local msg = ''
  if #done > 0 then msg = 'Installed ' .. table.concat(done, ', ') .. '.\n\nRestart REAPER, then run this installer again.' end
  if #failed > 0 then
    local lines = {}
    for _, f in ipairs(failed) do lines[#lines + 1] = f.name .. ': ' .. f.why end
    msg = msg .. (msg ~= '' and '\n\n' or '') .. 'Could not install:\n' .. table.concat(lines, '\n')
      .. '\n\nYou can install them with ReaPack (reapack.com) instead.'
  end
  return msg
end

-- The installer's window needs ReaImGui, so without it this step is a plain message box
if not r.ImGui_GetBuiltinPath then
  local missing = MissingExtensions()
  local names = {}
  for _, e in ipairs(missing) do names[#names + 1] = '  \u{2022} ' .. e.name .. ' (' .. e.why .. ')' end
  local msg = 'Cool Reaper Scripts need these free REAPER extensions:\n\n' .. table.concat(names, '\n')
    .. '\n\nInstall them now? They\'re downloaded from their authors\' official release pages.'
  if r.ShowMessageBox(msg, 'Cool Reaper Scripts Installer', 4) == 6 then
    local done, failed = InstallExtensions(missing)
    r.ShowMessageBox(ExtensionReport(done, failed), 'Cool Reaper Scripts Installer', 0)
  end
  return
end
package.path = r.ImGui_GetBuiltinPath() .. '/?.lua'
local im = require 'imgui' '0.9.3'

---------------------------------------------------------------------------------------------------
-- State
---------------------------------------------------------------------------------------------------

local S = {
  screen = 'license',        -- license | pick | install | done
  key = r.GetExtState(EXT, 'licenseKey'),
  email = r.GetExtState(EXT, 'email'),
  msg = nil,                 -- { kind = 'err'|'ok'|'info', text }
  busy = nil,                -- { label, fn, frames }
  products = {},             -- from the site, plus .releases, .choice, .checked
  queue = {}, done = 0, failed = {}, installedNow = {},
  extInstalled = {},         -- extensions downloaded this run (loaded after a restart)
}

local function Busy(label, fn) S.busy = { label = label, fn = fn, frames = 0 } S.msg = nil end

local function Friendly(err)
  local l = tostring(err or ''):lower()
  if l:find('not found') or l:find('invalid') then return 'That key wasn\'t recognized. Use the key from your purchase or trial email.' end
  if l:find('expired') then return 'This key has expired. Buy a license on coolreaperscripts.com to keep installing updates.' end
  return tostring(err)
end

local function InstalledVersion(p)
  local v = r.GetExtState(EXT, 'installed_' .. p.id)
  if v ~= '' then return v end
  local txt = ReadFile(NativePath(RES .. '/' .. p.installDir .. '/version.txt'))
  return txt and txt:match('release:%s*([%w%.%-]+)') or nil
end


---------------------------------------------------------------------------------------------------
-- Steps
---------------------------------------------------------------------------------------------------

local function CheckKey()
  S.key = S.key:gsub('%s', '')
  S.keyStatus, S.keyExpires = nil, nil
  -- a key is optional: released versions install without one, it unlocks development versions
  -- and fills in the license for the installed scripts
  if S.key ~= '' then
    local data, err = Api(VERIFY_URL, { licenseKey = S.key })
    if not data then S.msg = { kind = 'err', text = Friendly(err) } return end
    if data.status ~= 'active' and data.status ~= 'trial' then
      S.msg = { kind = 'err', text = Friendly(data.reason or data.status) }
      return
    end
    S.keyStatus, S.keyExpires = data.status, data.expiresAt
  end
  r.SetExtState(EXT, 'licenseKey', S.key, true)
  r.SetExtState(EXT, 'email', S.email, true)

  local list, perr = Api(API, { action = 'products' })
  if not list then S.msg = { kind = 'err', text = perr } return end
  S.products = {}
  for _, p in ipairs(list.products or {}) do
    local rel = Api(API, { action = 'releases', product = p.id, licenseKey = S.key })
    p.releases = {}
    for _, x in ipairs(rel and rel.releases or {}) do
      -- version-like tags only ("1.08", "v1.02", "Ver0.9"); a few early releases have none
      if not x.prerelease and tostring(x.tag):match('^%a*%d') then p.releases[#p.releases + 1] = x end
    end
    p.branch = rel and rel.branch or 'main'
    p.choice = 1 -- newest release, or the branch when there are none (needs a key)
    p.installed = InstalledVersion(p)
    p.checked = true
    S.products[#S.products + 1] = p
  end
  S.screen = 'pick'
end

local function DevAllowed() return S.keyStatus ~= nil end

local function ChosenRef(p)
  local rel = p.releases[p.choice]
  if rel then return rel.tag, rel.tag end
  return p.branch, 'Latest development version'
end

local function StartInstall()
  S.queue, S.done, S.failed, S.installedNow = {}, 0, {}, {}
  for _, p in ipairs(S.products) do
    if p.checked then
      local ref, label = ChosenRef(p)
      local list, err = Api(API, { action = 'files', product = p.id, licenseKey = S.key, ref = ref })
      if not list then S.msg = { kind = 'err', text = p.name .. ': ' .. Friendly(err) } return end
      local userData = {}
      for _, u in ipairs(p.userData or {}) do userData[u] = true end
      for _, f in ipairs(list.files or {}) do
        local rel = f.path
        if p.mainScript and rel == p.mainScript.from then rel = p.mainScript.to end
        local target = NativePath(RES .. '/' .. p.installDir .. '/' .. rel)
        if not (userData[f.path] and Exists(target)) then
          S.queue[#S.queue + 1] = { product = p, path = f.path, target = target, ref = ref, size = f.size }
        end
      end
      S.installedNow[#S.installedNow + 1] = { product = p, ref = ref, label = label, version = list.version }
    end
  end
  if #S.queue == 0 then S.msg = { kind = 'err', text = 'Nothing to install.' } return end
  S.screen = 'install'
end

-- one file per frame, so the window keeps redrawing
local function InstallNext()
  local item = S.queue[S.done + #S.failed + 1]
  if not item then return false end
  r.RecursiveCreateDirectory(DirOf(item.target), 0)
  local tmp = item.target .. '.download'
  os.remove(tmp)
  local code, _, err = Post(API, { action = 'download', product = item.product.id, licenseKey = S.key, path = item.path, ref = item.ref }, tmp)
  local data = ReadFile(tmp)
  if code == 200 and data and (#data > 0 or (item.size or 0) == 0) then
    os.remove(item.target)
    if os.rename(tmp, item.target) then
      S.done = S.done + 1
      return true
    end
    err = 'could not replace the file (is it open somewhere?)'
  end
  os.remove(tmp)
  local why = err
  if not why or why == '' then
    local j = data and JsonDecode(data)
    why = (type(j) == 'table' and j.error) or ('HTTP ' .. tostring(code))
  end
  S.failed[#S.failed + 1] = { path = item.path, why = why }
  return true
end

local function FinishInstall()
  for _, it in ipairs(S.installedNow) do
    local p = it.product
    if p.mainScript then
      local path = NativePath(RES .. '/' .. p.installDir .. '/' .. p.mainScript.to)
      if Exists(path) then it.cmd = r.AddRemoveReaScript(true, 0, path, true) end
    end
    -- the scripts' own updaters read the installed release from version.txt
    if it.ref ~= p.branch then
      WriteFile(NativePath(RES .. '/' .. p.installDir .. '/version.txt'), 'release: ' .. it.ref .. '\n')
    end
    r.SetExtState(EXT, 'installed_' .. p.id, it.ref ~= p.branch and it.ref or 'development version', true)
    -- the script activates this computer with these on its first start (no key typing needed)
    if p.licenseSection and S.key ~= '' and r.GetExtState(p.licenseSection, 'licenseKey') == '' then
      r.SetExtState(p.licenseSection, 'licenseKey', S.key, true)
      if S.email ~= '' then r.SetExtState(p.licenseSection, 'email', S.email, true) end
    end
  end
  S.screen = 'done'
end

---------------------------------------------------------------------------------------------------
-- Window
---------------------------------------------------------------------------------------------------

local ctx = im.CreateContext('Cool Reaper Scripts Installer')
local F = {
  body = im.CreateFont('sans-serif', 14),
  bold = im.CreateFont('sans-serif', 14, im.FontFlags_Bold),
  title = im.CreateFont('sans-serif', 19, im.FontFlags_Bold),
  small = im.CreateFont('sans-serif', 12),
  mono = im.CreateFont('monospace', 13),
}
for _, f in pairs(F) do im.Attach(ctx, f) end

local C = {
  bg = 0x1B1D21FF, text = 0xE8EAEDFF, muted = 0x9097A1FF, faint = 0x666C75FF, border = 0x30343BFF,
  field = 0x131518FF, btn = 0x2B2F35FF, btnHvr = 0x353A41FF, btnAct = 0x40454DFF,
  accent = 0x2BB38EFF, accentHvr = 0x3CC9A1FF, accentAct = 0x229A7AFF, onAccent = 0x0B1D17FF,
  green = 0x4CD68AFF, amber = 0xF2B04BFF, red = 0xEF6A6AFF, blue = 0x72A8FFFF,
}
local function A(c, a) return ((c & 0xFFFFFF00) | (a & 0xFF)) & 0xFFFFFFFF end

local function Muted(text, small)
  if small then im.PushFont(ctx, F.small) end
  im.PushStyleColor(ctx, im.Col_Text, small and C.faint or C.muted)
  im.TextWrapped(ctx, text)
  im.PopStyleColor(ctx)
  if small then im.PopFont(ctx) end
end

local function Caps(text)
  im.PushFont(ctx, F.small)
  im.PushStyleColor(ctx, im.Col_Text, C.muted)
  im.Text(ctx, text:upper())
  im.PopStyleColor(ctx)
  im.PopFont(ctx)
end

local function Btn(label, w, kind, h)
  local c, ch, ca, t = C.btn, C.btnHvr, C.btnAct, C.text
  if kind == 'primary' then c, ch, ca, t = C.accent, C.accentHvr, C.accentAct, C.onAccent end
  im.PushStyleColor(ctx, im.Col_Button, c)
  im.PushStyleColor(ctx, im.Col_ButtonHovered, ch)
  im.PushStyleColor(ctx, im.Col_ButtonActive, ca)
  im.PushStyleColor(ctx, im.Col_Text, t)
  if kind == 'primary' then im.PushFont(ctx, F.bold) end
  local clicked = im.Button(ctx, label, w or 0, h or 0)
  if kind == 'primary' then im.PopFont(ctx) end
  im.PopStyleColor(ctx, 4)
  return clicked
end

local function Link(text)
  im.PushStyleColor(ctx, im.Col_Text, C.accent)
  im.Text(ctx, text)
  im.PopStyleColor(ctx)
  local hov = im.IsItemHovered(ctx)
  if hov then
    local x1, y1 = im.GetItemRectMin(ctx)
    local x2, y2 = im.GetItemRectMax(ctx)
    im.DrawList_AddLine(im.GetWindowDrawList(ctx), x1, y2, x2, y2, C.accent, 1)
    im.SetMouseCursor(ctx, im.MouseCursor_Hand)
  end
  return hov and im.IsMouseClicked(ctx, 0)
end

local function Banner(kind, text)
  local color = (kind == 'err' and C.red) or (kind == 'ok' and C.green) or (kind == 'warn' and C.amber) or C.blue
  local w = im.GetContentRegionAvail(ctx)
  local x, y = im.GetCursorScreenPos(ctx)
  local _, th = im.CalcTextSize(ctx, text, nil, nil, false, w - 28)
  local h = th + 18
  local dl = im.GetWindowDrawList(ctx)
  im.DrawList_AddRectFilled(dl, x, y, x + w, y + h, A(color, 0x1C), 6)
  im.DrawList_AddRect(dl, x, y, x + w, y + h, A(color, 0x55), 6, 0, 1)
  im.DrawList_AddRectFilled(dl, x + 1, y + 6, x + 3, y + h - 6, color)
  im.SetCursorScreenPos(ctx, x + 14, y + 9)
  im.PushTextWrapPos(ctx, im.GetCursorPosX(ctx) + w - 28)
  im.Text(ctx, text)
  im.PopTextWrapPos(ctx)
  im.SetCursorScreenPos(ctx, x, y)
  im.Dummy(ctx, w, h)
end

local function Header(sub)
  local x, y = im.GetCursorScreenPos(ctx)
  local dl = im.GetWindowDrawList(ctx)
  local sz = 36
  im.DrawList_AddRectFilled(dl, x, y, x + sz, y + sz, A(C.accent, 0x26), 8)
  im.DrawList_AddRect(dl, x, y, x + sz, y + sz, A(C.accent, 0x55), 8, 0, 1)
  -- download arrow
  local cx = x + sz / 2
  im.DrawList_AddLine(dl, cx, y + 9, cx, y + 23, C.accent, 2.5)
  im.DrawList_AddLine(dl, cx - 6, y + 17, cx, y + 23, C.accent, 2.5)
  im.DrawList_AddLine(dl, cx + 6, y + 17, cx, y + 23, C.accent, 2.5)
  im.DrawList_AddLine(dl, x + 10, y + 27, x + sz - 10, y + 27, C.accent, 2.5)
  im.SetCursorScreenPos(ctx, x + sz + 12, y - 1)
  im.PushFont(ctx, F.title)
  im.Text(ctx, 'Cool Reaper Scripts')
  im.PopFont(ctx)
  im.SetCursorScreenPos(ctx, x + sz + 12, y + 21)
  im.PushFont(ctx, F.small)
  im.PushStyleColor(ctx, im.Col_Text, C.muted)
  im.Text(ctx, sub)
  im.PopStyleColor(ctx)
  im.PopFont(ctx)
  im.SetCursorScreenPos(ctx, x, y)
  im.Dummy(ctx, sz, sz)
  local w = im.GetContentRegionAvail(ctx)
  local _, ly = im.GetCursorScreenPos(ctx)
  im.DrawList_AddLine(dl, x, ly + 4, x + w, ly + 4, C.border, 1)
  im.Dummy(ctx, w, 8)
end

local function Spinner(text)
  local x, y = im.GetCursorScreenPos(ctx)
  local dl = im.GetWindowDrawList(ctx)
  local t = im.GetTime(ctx)
  for i = 0, 2 do
    local a = 0.35 + 0.65 * math.max(0, math.sin(t * 5 - i * 0.8))
    im.DrawList_AddCircleFilled(dl, x + 5 + i * 9, y + 8, 3, A(C.accent, math.floor(a * 255)))
  end
  im.Dummy(ctx, 28, 16)
  im.SameLine(ctx)
  im.PushStyleColor(ctx, im.Col_Text, C.muted)
  im.Text(ctx, text)
  im.PopStyleColor(ctx)
end

local function LicenseScreen()
  Muted('Already have a license or trial key? Enter it here so your scripts are ready to go. No key? Just continue: each script starts a free 30-day trial when it first runs.')
  im.Dummy(ctx, 0, 4)
  local w = im.GetContentRegionAvail(ctx)
  Caps('License or trial key (optional)')
  im.PushFont(ctx, F.mono)
  im.SetNextItemWidth(ctx, w - 72)
  local e1, k = im.InputTextWithHint(ctx, '##key', 'xxxxxxxxxxxxxxxx-xxxxxxxx', S.key, im.InputTextFlags_EnterReturnsTrue)
  S.key = (k or S.key):gsub('%s', '')
  im.PopFont(ctx)
  im.SameLine(ctx)
  if Btn('Paste', 64) then S.key = (im.GetClipboardText(ctx) or ''):gsub('%s', '') end
  Caps('Email (optional)')
  im.SetNextItemWidth(ctx, w)
  local e2, e = im.InputTextWithHint(ctx, '##email', 'you@example.com', S.email, im.InputTextFlags_EnterReturnsTrue)
  S.email = (e or S.email):match('^%s*(.-)%s*$')
  Muted('Used to activate this computer the first time you run a script.', true)
  if S.msg then Banner(S.msg.kind, S.msg.text) end
  im.Dummy(ctx, 0, 4)
  local hasKey = S.key ~= ''
  if Btn(hasKey and 'Continue' or 'Continue without a key', w, 'primary', 36) or e1 or e2 then
    Busy(hasKey and 'Checking your key...' or 'Getting the script list...', CheckKey)
  end
  im.Dummy(ctx, 0, 2)
  if Link('Buy a license') then OpenUrl(SITE .. '/#pricing') end
end

local function PickScreen()
  if DevAllowed() then
    local status = S.keyStatus == 'trial' and 'Free trial' or 'License'
    if S.keyStatus == 'trial' and tonumber(S.keyExpires) then
      local exp = tonumber(S.keyExpires)
      if exp > 1e11 then exp = exp / 1000 end
      status = status .. ', ' .. math.max(0, math.ceil((exp - os.time()) / 86400)) .. ' days left'
    end
    Muted(status .. ' \194\183 ' .. S.key:sub(1, 4) .. string.rep('\194\183', 6) .. S.key:sub(-4))
  else
    Muted('No key entered. Each script starts its free trial, or asks for your license, when it first runs.')
  end
  im.Dummy(ctx, 0, 4)
  Caps('Scripts')
  for i, p in ipairs(S.products) do
    im.PushID(ctx, i)
    local _, v = im.Checkbox(ctx, '##chk', p.checked)
    p.checked = v
    im.SameLine(ctx)
    im.PushFont(ctx, F.bold)
    im.Text(ctx, p.name)
    im.PopFont(ctx)
    im.SameLine(ctx)
    im.PushStyleColor(ctx, im.Col_Text, p.installed and C.green or C.faint)
    im.Text(ctx, p.installed and ('installed: ' .. p.installed) or 'not installed')
    im.PopStyleColor(ctx)
    im.Indent(ctx, 30)
    if p.description then Muted(p.description, true) end
    local _, label = ChosenRef(p)
    local preview = p.releases[p.choice] and ('Version ' .. label .. (p.choice == 1 and ' (newest)' or '')) or label
    local availW = im.GetContentRegionAvail(ctx)
    im.SetNextItemWidth(ctx, availW)
    if im.BeginCombo(ctx, '##ver', preview) then
      for j, rel in ipairs(p.releases) do
        local about = rel.name:gsub('^v?' .. rel.tag:gsub('%p', '%%%0') .. '%s*[-:]*%s*', '')
        if about:match('^%a*%d[%d%.]*$') then about = '' end -- just the version again
        if #about > 48 then about = about:sub(1, 46) .. '...' end
        local label = 'Version ' .. rel.tag .. (j == 1 and ' (newest)' or '') .. (about ~= '' and ('  \194\183  ' .. about) or '')
        if im.Selectable(ctx, label .. '##' .. j, p.choice == j) then p.choice = j end
      end
      if DevAllowed() and im.Selectable(ctx, 'Latest development version', p.choice > #p.releases) then p.choice = #p.releases + 1 end
      im.EndCombo(ctx)
    end
    local rel = p.releases[p.choice]
    if rel and rel.notes and rel.notes ~= '' and im.IsItemHovered(ctx) then
      im.SetTooltip(ctx, rel.notes:sub(1, 600))
    end
    im.Unindent(ctx, 30)
    im.Dummy(ctx, 0, 4)
    im.PopID(ctx)
  end

  Caps('Also needed (free REAPER extensions)')
  local toInstall = {}
  for _, e in ipairs(EXTENSIONS) do
    local ok, pending = e.loaded(), S.extInstalled[e.name]
    im.PushStyleColor(ctx, im.Col_Text, ok and C.green or pending and C.blue or C.amber)
    im.Text(ctx, ok and 'OK' or pending and 'NEW' or '--')
    im.PopStyleColor(ctx)
    im.SameLine(ctx, 64)
    im.Text(ctx, e.name)
    im.SameLine(ctx)
    im.PushStyleColor(ctx, im.Col_Text, C.faint)
    im.Text(ctx, pending and 'restart REAPER to load it' or ok and e.why or 'missing')
    im.PopStyleColor(ctx)
    if not ok and not pending then toInstall[#toInstall + 1] = e end
  end
  if #toInstall > 0 then
    if Btn(#toInstall == 1 and ('Install ' .. toInstall[1].name) or ('Install the ' .. #toInstall .. ' missing extensions')) then
      Busy('Downloading extensions...', function()
        local done, failed = InstallExtensions(toInstall)
        for _, name in ipairs(done) do S.extInstalled[name] = true end
        S.msg = { kind = #failed > 0 and 'warn' or 'ok', text = ExtensionReport(done, failed):gsub(', then run this installer again', '. You can install the scripts first') }
      end)
    end
  end
  im.Dummy(ctx, 0, 4)
  if S.msg then Banner(S.msg.kind, S.msg.text) end
  local any = false
  for _, p in ipairs(S.products) do any = any or p.checked end
  local w = im.GetContentRegionAvail(ctx)
  if not any then im.BeginDisabled(ctx, true) end
  if Btn('Install', w, 'primary', 36) then Busy('Getting the file list...', StartInstall) end
  if not any then im.EndDisabled(ctx) end
  if Link(DevAllowed() and 'Use a different key' or 'Enter a key') then S.screen = 'license' S.msg = nil end
end

local function InstallScreen()
  local total = #S.queue
  local n = S.done + #S.failed
  local item = S.queue[n + 1]
  Muted(item and ('Installing ' .. item.path) or 'Finishing...')
  im.PushStyleColor(ctx, im.Col_PlotHistogram, C.accent)
  im.ProgressBar(ctx, total > 0 and n / total or 1, -1, 0, ('%d of %d files'):format(n, total))
  im.PopStyleColor(ctx)
  if item then
    InstallNext()
  else
    FinishInstall()
  end
end

local function DoneScreen()
  local ok = #S.failed == 0
  Banner(ok and 'ok' or 'warn', ok and ('Installed %d files.'):format(S.done)
    or ('Installed %d files; %d failed. Run the installer again to retry.'):format(S.done, #S.failed))
  for _, f in ipairs(S.failed) do Muted(f.path .. ': ' .. tostring(f.why):sub(1, 120), true) end
  im.Dummy(ctx, 0, 4)
  for _, it in ipairs(S.installedNow) do
    im.PushFont(ctx, F.bold)
    im.Text(ctx, it.product.name)
    im.PopFont(ctx)
    im.SameLine(ctx)
    im.PushStyleColor(ctx, im.Col_Text, C.muted)
    im.Text(ctx, it.label)
    im.PopStyleColor(ctx)
    if it.cmd and it.cmd ~= 0 then
      im.PushID(ctx, it.product.id)
      if Btn('Run ' .. it.product.name, 0, 'primary') then
        r.Main_OnCommand(it.cmd, 0)
        S.close = true
      end
      im.PopID(ctx)
      Muted('It\'s also in the Action List as "' .. it.product.mainScript.to:gsub('%.lua$', '') .. '".', true)
    end
  end
  im.Dummy(ctx, 0, 4)
  if Btn('Close', 90) then S.close = true end
end

local function Frame()
  im.PushStyleColor(ctx, im.Col_WindowBg, C.bg)
  im.PushStyleColor(ctx, im.Col_Text, C.text)
  im.PushStyleColor(ctx, im.Col_FrameBg, C.field)
  im.PushStyleColor(ctx, im.Col_FrameBgHovered, 0x17191DFF)
  im.PushStyleColor(ctx, im.Col_FrameBgActive, C.field)
  im.PushStyleColor(ctx, im.Col_Border, C.border)
  im.PushStyleColor(ctx, im.Col_CheckMark, C.accent)
  im.PushStyleColor(ctx, im.Col_TitleBg, C.bg)
  im.PushStyleColor(ctx, im.Col_TitleBgActive, C.bg)
  im.PushStyleVar(ctx, im.StyleVar_WindowPadding, 22, 18)
  im.PushStyleVar(ctx, im.StyleVar_FrameRounding, 6)
  im.PushStyleVar(ctx, im.StyleVar_FramePadding, 10, 7)
  im.PushStyleVar(ctx, im.StyleVar_ItemSpacing, 8, 8)
  im.PushStyleVar(ctx, im.StyleVar_FrameBorderSize, 1)
  im.PushFont(ctx, F.body)
  im.SetNextWindowSize(ctx, 500, 0, im.Cond_Always)
  local visible, open = im.Begin(ctx, 'Cool Reaper Scripts Installer', true, im.WindowFlags_NoCollapse | im.WindowFlags_NoResize)
  if visible then
    local subs = { license = 'Installer \194\183 step 1 of 2', pick = 'Installer \194\183 step 2 of 2', install = 'Installing...', done = 'Done' }
    Header(subs[S.screen])
    if S.busy then
      Spinner(S.busy.label)
      S.busy.frames = S.busy.frames + 1
      if S.busy.frames >= 3 then -- let the label draw before the blocking request
        local fn = S.busy.fn
        S.busy = nil
        fn()
      end
    elseif S.screen == 'license' then LicenseScreen()
    elseif S.screen == 'pick' then PickScreen()
    elseif S.screen == 'install' then InstallScreen()
    else DoneScreen() end
    im.End(ctx)
  end
  im.PopFont(ctx)
  im.PopStyleVar(ctx, 5)
  im.PopStyleColor(ctx, 9)
  if open and not S.close then r.defer(Frame) end
end

r.defer(Frame)
