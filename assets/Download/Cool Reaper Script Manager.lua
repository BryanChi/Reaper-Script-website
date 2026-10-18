-- @description Cool Reaper Script Manager
-- @version 3.3.1
-- @author bryan
-- @about
--   Installs, updates and licenses Cool Reaper Scripts (Vertical FX List, FX Devices) from
--   coolreaperscripts.com. Shows what's installed, what's newer, and which scripts you own, with a
--   Buy button for the ones you don't. Run it any time to update.
-- @changelog
--   3.3.1: installs ReaImGui with its Lua files (imgui.lua), so one restart is enough; fixes a
--          ReaImGui the 3.3.0 setup left without them. Windows: no console window flashing
--          while you sign in.
--   3.3.0: without ReaImGui the Manager no longer stops with an error: it lists the missing
--          extensions and installs them in one click, says when only a restart is needed, and
--          points to ReaPack when a download fails. Flags a ReaImGui too old for Vertical FX List.
--   3.2.0: "Sign in with browser" replaces the key box and the email trial (the same sign-in the
--          scripts use, and it activates this computer for the script too). Run from Downloads,
--          the Manager moves itself into REAPER's Scripts folder and its Actions list.
--   3.1.0: every download needs a license or a free trial (released versions too).
--   3.0.0: now the Cool Reaper Script Manager: one window for every script, update buttons,
--          a license key or free trial per script, Buy buttons, FX Devices, the Monolith look.
--   2.0.0: downloads from coolreaperscripts.com (no key needed for released versions), new window,
--          dependency check, version picker, fills in your license for the installed scripts.

local r = reaper

local VERSION = '3.3.1'
local SITE = 'https://www.coolreaperscripts.com'
local API = SITE .. '/api/scripts'
local VERIFY_URL = SITE .. '/api/license/verify'
local LINK_URL = SITE .. '/api/license/info'
local FONT_URL = SITE .. '/assets/Fonts/'
-- kept from the 2.0 installer: the scripts read what was installed from this section
local EXT = 'CoolReaperScripts_Installer'
-- tells the site this client can put files outside the script's folder (FX Devices' JSFX)
local CLIENT = 3
local TITLE = 'Cool Reaper Script Manager'
-- where the Manager keeps itself (next to Vertical FX List), relative to REAPER's resource folder
local MANAGER_DIR = 'Scripts/CoolReaperScripts'
local MANAGER_FILE = 'Cool Reaper Script Manager.lua'

local OS = r.GetOS()
local IS_WIN = OS:match('Win') ~= nil
local SEP = IS_WIN and '\\' or '/'
local RES = r.GetResourcePath()

---------------------------------------------------------------------------------------------------
-- Opening links
---------------------------------------------------------------------------------------------------

local function OpenUrl(url)
  if r.CF_ShellExecute then r.CF_ShellExecute(url) return end
  if IS_WIN then r.ExecProcess('cmd.exe /C start "" "' .. url .. '"', -2)
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

-- The same POST in the background, so the window keeps drawing while sign-in waits on the browser.
-- AsyncPost returns a job; AsyncResult(job) is nil until curl is done, then the answer (decoded).
local function AsyncPost(url, body)
  local job = { body = TempFile('body.json'), out = TempFile('out.txt'), done = TempFile('done.txt'), started = os.time() }
  if not WriteFile(job.body, JsonEncode(body)) then return nil end
  if IS_WIN then
    -- cmd /C strips the outer quotes; ExecProcess with -2 returns at once and starts it minimized
    -- (-1 flashes a console window on every sign-in poll)
    r.ExecProcess(string.format(
      'cmd.exe /C ""curl" -L -s -S --max-time 15 -X POST -H "Content-Type: application/json" --data-binary "@%s" -o "%s" "%s" & echo done>"%s""',
      job.body, job.out, url, job.done), -2)
  else
    job.sh = TempFile('run.sh')
    if not WriteFile(job.sh, string.format("#!/bin/sh\n/usr/bin/curl -L -s -S --max-time 15 -X POST -H %s --data-binary @%s %s > %s 2>&1\necho done > %s\n",
      ShellQuote('Content-Type: application/json'), ShellQuote(job.body), ShellQuote(url), ShellQuote(job.out), ShellQuote(job.done))) then
      os.remove(job.body)
      return nil
    end
    os.execute('/bin/sh ' .. ShellQuote(job.sh) .. ' >/dev/null 2>&1 &')
  end
  return job
end

local function AsyncResult(job)
  local finished = Exists(job.done)
  if not finished and os.time() - job.started < 30 then return nil end
  local text = finished and ReadFile(job.out) or ''
  for _, f in ipairs({ job.body, job.out, job.done, job.sh }) do if f then os.remove(f) end end
  local data = text and JsonDecode(text)
  return type(data) == 'table' and data or false
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

-- Newest build of a package listed in a ReaPack index: the extension binary for this computer,
-- plus the url of each file named in extras (ReaImGui's Lua files, which ReaPack would add)
local indexCache = {}
local function FromReaPackIndex(indexUrl, package, plat, extras)
  local xml = indexCache[indexUrl]
  if not xml then
    local idx = TempFile('index.xml')
    local ok, err = Get(indexUrl, idx)
    xml = ok and ReadFile(idx)
    os.remove(idx)
    if not xml then return nil, err end
    indexCache[indexUrl] = xml
  end
  local s = xml:find('<reapack name="' .. package .. '"', 1, true)
  if not s then return nil, package .. ' not listed' end
  local block = xml:sub(s, (xml:find('</reapack>', s, true) or #xml))
  local last
  for v in block:gmatch('<version.-</version>') do last = v end -- versions are listed oldest first
  if not last then return nil, 'no versions of ' .. package end
  local sources = {}
  for attrs, url in last:gmatch('<source([^>]*)>([^<]+)</source>') do
    local file = attrs:match('file="([^"]+)"') or url:match('([^/]+)$')
    sources[#sources + 1] = { platform = attrs:match('platform="([^"]+)"') or 'all',
      file = file:match('([^/\\]+)$'), url = (url:gsub('&amp;', '&')) }
  end
  local found
  for _, name in ipairs(plat.names) do
    for _, src in ipairs(sources) do
      if not found and src.platform == name and src.file:match('%.' .. plat.ext .. '$') then found = src end
    end
  end
  if not found then return nil, 'no build of ' .. package .. ' for this computer' end
  local res = { url = found.url, file = found.file, extras = {} }
  for _, want in ipairs(extras or {}) do
    for _, src in ipairs(sources) do
      if src.file == want then res.extras[#res.extras + 1] = src end
    end
  end
  if #res.extras < #(extras or {}) then return nil, 'some of ' .. package .. '\'s files aren\'t listed' end
  return res
end

-- The scripts' settings windows ("Scripts and updates") run the Manager from here.
local function ManagerPath() return NativePath(RES .. '/' .. MANAGER_DIR .. '/' .. MANAGER_FILE) end

-- Run from Downloads (or anywhere outside REAPER's Scripts folder), the Manager copies itself to
-- Scripts/CoolReaperScripts, puts that copy in the Actions list instead, and removes the download.
-- Returns a note for the window, if there's something to say.
local function SettleIn()
  local _, self = r.get_action_context()
  if not self or self == '' then
    local src = debug.getinfo(1, 'S').source or ''
    self = src:sub(1, 1) == '@' and src:sub(2) or nil
  end
  if not self or not Exists(self) then return end
  local function Norm(path)
    path = path:gsub('\\', '/'):gsub('/+', '/')
    return IS_WIN and path:lower() or path
  end
  local scripts = Norm(RES .. '/Scripts/')
  if Norm(self):sub(1, #scripts) == scripts then
    -- kept somewhere else in Scripts: still put a copy where the scripts look for it
    if Norm(self) ~= Norm(ManagerPath()) and not Exists(ManagerPath()) then
      local data = ReadFile(self)
      r.RecursiveCreateDirectory(DirOf(ManagerPath()), 0)
      if data then WriteFile(ManagerPath(), data) end
    end
    return
  end
  local target = ManagerPath()
  local data = ReadFile(self)
  r.RecursiveCreateDirectory(DirOf(target), 0)
  if not data or not WriteFile(target, data) then
    return { kind = 'warn', text = 'Couldn\'t copy the Script Manager into REAPER\'s Scripts folder, so it keeps running from where you downloaded it.' }
  end
  r.AddRemoveReaScript(true, 0, target, true)
  r.AddRemoveReaScript(false, 0, self, true)
  local removed = os.remove(self)
  return { kind = 'ok', text = 'The Script Manager moved itself into REAPER'
    .. (removed and ', so the downloaded file is gone. ' or '. You can delete the downloaded file. ')
    .. 'After this install you won\'t need it again: every Cool Reaper Script opens it from its settings window (Scripts and updates).' }
end

local EXTENSIONS = {
  { name = 'ReaPack', why = 'installs and updates REAPER add-ons', file = 'reaper_reapack',
    loaded = function() return r.ReaPack_BrowsePackages ~= nil end,
    asset = 'https://github.com/cfillion/reapack/releases/latest/download/reaper_reapack-%s.%s', hasArm64ec = true },
  { name = 'ReaImGui', why = 'draws the scripts\' windows', file = 'reaper_imgui',
    loaded = function() return r.ImGui_GetBuiltinPath ~= nil end,
    -- Vertical FX List needs 0.10 (Col_InputTextCursor is new in it); the Manager itself 0.9.3
    outdated = function() return r.ImGui_Col_InputTextCursor == nil end,
    -- scripts load ReaImGui through imgui.lua, which ReaPack puts next to the binary's API docs
    index = 'https://github.com/ReaTeam/Extensions/raw/master/index.xml', package = 'reaper_imgui.ext',
    extras = { 'imgui.lua', 'gfx2imgui.lua' },
    extrasDir = function()
      return r.ImGui_GetBuiltinPath and r.ImGui_GetBuiltinPath() or (RES .. '/Scripts/ReaTeam Extensions/API')
    end },
  { name = 'js_ReaScriptAPI', why = 'mouse and window helpers', file = 'reaper_js_ReaScriptAPI',
    loaded = function() return r.JS_Window_Find ~= nil end,
    index = 'https://github.com/ReaTeam/Extensions/raw/master/index.xml', package = 'js_ReaScriptAPI.ext' },
  { name = 'SWS Extension', why = 'extra track and send functions', file = 'reaper_sws',
    loaded = function() return r.CF_ShellExecute ~= nil or r.BR_GetSetTrackSendInfo ~= nil end,
    asset = 'https://github.com/reaper-oss/sws/releases/latest/download/reaper_sws-%s.%s' },
}

local PLUGINS = RES .. SEP .. 'UserPlugins'

-- Is the extension's file in UserPlugins already? (downloaded, but REAPER hasn't loaded it yet)
local onDisk
local function OnDisk(e)
  if not onDisk then
    onDisk = {}
    local ext = '%.' .. Platform().ext .. '$'
    r.EnumerateFiles(PLUGINS, -1) -- re-read the folder
    local i = 0
    while true do
      local f = r.EnumerateFiles(PLUGINS, i)
      if not f then break end
      if f:match(ext) then onDisk[#onDisk + 1] = f:lower() end
      i = i + 1
    end
  end
  local prefix = e.file:lower()
  for _, f in ipairs(onDisk) do
    if f:sub(1, #prefix) == prefix then return true end
  end
  return false
end

-- 'ok', 'outdated', 'restart' (downloaded, loads after a restart) or 'missing'
local downloadedNow = {} -- names installed by this run
-- loaded, but its Lua files are missing (an older Manager downloaded only the binary)
local function ExtrasMissing(e)
  if not e.extras then return false end
  for _, f in ipairs(e.extras) do
    if not Exists(NativePath(e.extrasDir() .. '/' .. f)) then return true end
  end
  return false
end

local function ExtStatus(e)
  if downloadedNow[e.name] then return 'restart' end
  if e.loaded() then return ((e.outdated and e.outdated()) or ExtrasMissing(e)) and 'outdated' or 'ok' end
  return OnDisk(e) and 'restart' or 'missing'
end

-- the ones to download: missing or too old
local function MissingExtensions()
  local list = {}
  for _, e in ipairs(EXTENSIONS) do
    local st = ExtStatus(e)
    if st == 'missing' or st == 'outdated' then list[#list + 1] = e end
  end
  return list
end

-- Installs the given extensions; returns names installed, { name, why } failures, and whether
-- REAPER has to restart to load them (not when only Lua files were missing)
local function InstallExtensions(list)
  local plat = Platform()
  r.RecursiveCreateDirectory(PLUGINS, 0)
  local done, failed, restart = {}, {}, false
  for _, e in ipairs(list) do
    local url, file, extras, err
    if e.asset then
      local arch = (plat.arch == 'arm64ec' and not e.hasArm64ec) and plat.fallback or plat.arch
      url = e.asset:format(arch, plat.ext)
      file = url:match('([^/]+)$')
    else
      local found
      found, err = FromReaPackIndex(e.index, e.package, plat, e.extras)
      if found then url, file, extras = found.url, found.file, found.extras end
    end
    -- the loaded binary is current: only its Lua files are needed
    local binary = not (e.loaded() and not (e.outdated and e.outdated()))
    local ok = url ~= nil
    if ok and binary then
      ok, err = Get(url, PLUGINS .. SEP .. file)
      -- Windows won't let anyone replace an extension REAPER has loaded
      if not ok and e.loaded() and err and err:find('could not write') then err = 'REAPER is using the old version' end
    end
    if ok and extras and #extras > 0 then
      local dir = NativePath(e.extrasDir())
      r.RecursiveCreateDirectory(dir, 0)
      for _, x in ipairs(extras) do
        if ok then ok, err = Get(x.url, dir .. SEP .. x.file) end
      end
    end
    if ok then
      done[#done + 1] = e.name
      if binary then downloadedNow[e.name], restart = true, true end
    else
      failed[#failed + 1] = { name = e.name, why = err or 'download failed' }
    end
  end
  return done, failed, restart
end

local FIND_MANAGER = 'It\'s in Actions > Show action list: search for "Cool Reaper Script Manager".'

local function ExtensionReport(done, failed, restart)
  local msg = ''
  if #done > 0 then msg = 'Installed ' .. table.concat(done, ', ') .. '.'
    .. (restart and '\n\nRestart REAPER, then run the Script Manager again.' or '') end
  if #failed > 0 then
    local lines = {}
    for _, f in ipairs(failed) do lines[#lines + 1] = f.name .. ': ' .. f.why end
    msg = msg .. (msg ~= '' and '\n\n' or '') .. 'Could not install:\n' .. table.concat(lines, '\n')
      .. (r.ReaPack_BrowsePackages and '\n\nYou can install them with ReaPack instead: Extensions > ReaPack > Browse packages.'
        or '\n\nYou can install them with ReaPack (reapack.com) instead.')
  end
  return msg
end

-- The window needs ReaImGui. Without it (or with one too old), setup happens in message boxes.
local SETTLE_NOTE = SettleIn()
local imguiOK = r.ImGui_GetBuiltinPath ~= nil
if imguiOK then
  package.path = r.ImGui_GetBuiltinPath() .. '/?.lua'
  local ok, imgui = pcall(require, 'imgui')
  imguiOK = ok and type(imgui) == 'function' and pcall(imgui, '0.9.3')
end

-- Returns a note for the window when it can open after all (only ReaImGui's Lua files were missing)
local function SetupWithoutWindow()
  local box = TITLE .. ': setup'
  local function Bullets(list)
    local t = {}
    for _, e in ipairs(list) do t[#t + 1] = '  \u{2022} ' .. e.name .. ' (' .. e.why .. ')' end
    return table.concat(t, '\n')
  end
  local todo, waiting = MissingExtensions(), {}
  for _, e in ipairs(EXTENSIONS) do
    if ExtStatus(e) == 'restart' then waiting[#waiting + 1] = e end
  end
  -- ReaImGui loaded but scripts can't use it: fetch its files again
  local imgui = EXTENSIONS[2]
  if ExtStatus(imgui) == 'ok' then table.insert(todo, 1, imgui) end

  local msg
  if #todo == 0 then
    msg = 'These free extensions are downloaded and load the next time REAPER starts:\n\n' .. Bullets(waiting)
      .. '\n\nRestart REAPER, then run the Script Manager again.\n\n'
      .. 'Already restarted and still seeing this? Choose Yes to download them again.'
    todo = waiting
  else
    local old = ExtStatus(imgui) == 'outdated' or ExtStatus(imgui) == 'ok'
    msg = 'Cool Reaper Scripts need a few free REAPER extensions'
      .. (old and ' (ReaImGui needs an update)' or '') .. ':\n\n' .. Bullets(todo)
      .. (#waiting > 0 and ('\n\nAlready downloaded, loads after a restart:\n' .. Bullets(waiting)) or '')
      .. '\n\nInstall them now? It takes a few seconds. They come straight from their authors\' '
      .. 'official download pages and go into REAPER\'s UserPlugins folder.'
  end
  if r.ShowMessageBox(msg, box, 4) ~= 6 then return end

  local done, failed, restart = InstallExtensions(todo)
  local report = ExtensionReport(done, failed, restart)
  if r.ImGui_GetBuiltinPath then
    package.path = r.ImGui_GetBuiltinPath() .. '/?.lua'
    package.loaded.imgui = nil
    local ok, imgui = pcall(require, 'imgui')
    if ok and type(imgui) == 'function' and pcall(imgui, '0.9.3') then
      return { kind = #failed > 0 and 'warn' or 'ok', text = report }
    end
  end
  if #done > 0 then report = report .. '\n\n' .. FIND_MANAGER end
  if #failed == 0 then
    r.ShowMessageBox(report, box, 0)
  elseif r.ReaPack_BrowsePackages then
    if r.ShowMessageBox(report .. '\n\nOpen ReaPack now?', box, 4) == 6 then r.ReaPack_BrowsePackages(failed[1].name) end
  else
    if r.ShowMessageBox(report .. '\n\nOpen reapack.com now?', box, 4) == 6 then OpenUrl('https://reapack.com') end
  end
end

local SETUP_NOTE
if not imguiOK then
  SETUP_NOTE = SetupWithoutWindow()
  if not SETUP_NOTE then return end
end
local im = require 'imgui' '0.9.3'

---------------------------------------------------------------------------------------------------
-- Fonts: the Monolith look uses Anton (titles) and JetBrains Mono (labels), both SIL Open Font
-- License. They're downloaded once from the site; without them the window uses REAPER's fonts.
---------------------------------------------------------------------------------------------------

local FONT_DIR = NativePath(RES .. '/Scripts/CoolReaperScripts/Script Manager/Fonts')
local FONT_FILES = { 'Anton-Regular.ttf', 'JetBrainsMono-Medium.ttf', 'JetBrainsMono-SemiBold.ttf' }

local function EnsureFonts()
  r.RecursiveCreateDirectory(FONT_DIR, 0)
  -- an FX Devices install already has them
  local fxd = NativePath(RES .. '/Scripts/FX Devices/BryanChi_FX_Devices/src/Fonts')
  for _, f in ipairs(FONT_FILES) do
    local dest = FONT_DIR .. SEP .. f
    if not Exists(dest) then
      local data = ReadFile(fxd .. SEP .. f)
      if data then WriteFile(dest, data) else Get(FONT_URL .. f, dest) end
    end
  end
end
EnsureFonts()

---------------------------------------------------------------------------------------------------
-- State
---------------------------------------------------------------------------------------------------

local S = {
  email = r.GetExtState(EXT, 'email'),
  msg = nil,                 -- { kind = 'err'|'ok'|'info'|'warn', text } under the title
  busy = nil,                -- { label, fn, frames }: one blocking request, after its label drew
  products = {},             -- from the site, plus releases, choice, installed, key, lic, ...
  job = nil,                 -- the install in progress
  loaded = false,
}

local function Busy(label, fn) S.busy = { label = label, fn = fn, frames = 0 } end

local function Friendly(err)
  local l = tostring(err or ''):lower()
  if l:find('not found') or l:find('invalid') then return 'That key wasn\'t recognized. Use the key from your purchase or trial email.' end
  if l:find('expired') then return 'This key has expired. Buy a license to keep using and updating the script.' end
  return tostring(err)
end

-- expiry as unix seconds (the site sends ISO dates; older answers sent milliseconds)
local function ExpiryUnix(v)
  local n = tonumber(v)
  if n then return n > 1e11 and n / 1000 or n end
  local y, m, d, H, M = tostring(v or ''):match('^(%d+)-(%d+)-(%d+)T?(%d*):?(%d*)')
  if not y then return nil end
  -- the date is UTC; os.time reads a table as local time
  local now = os.time()
  local utcOffset = now - os.time(os.date('!*t', now))
  return os.time({ year = tonumber(y), month = tonumber(m), day = tonumber(d), hour = tonumber(H) or 12, min = tonumber(M) or 0 }) + utcOffset
end

local function DaysLeft(v)
  local t = ExpiryUnix(v)
  return t and math.max(0, math.ceil((t - os.time()) / 86400)) or nil
end

local function InstallPath(p, rel) return NativePath(RES .. '/' .. p.installDir .. '/' .. rel) end

local function MainScriptPath(p)
  return p.mainScript and InstallPath(p, p.mainScript.to) or nil
end

local function InstalledVersion(p)
  local v = r.GetExtState(EXT, 'installed_' .. p.id)
  if v ~= '' then return v end
  local txt = ReadFile(InstallPath(p, 'version.txt'))
  local tag = txt and txt:match('release:%s*([%w%.%-]+)')
  if tag then return tag end
  -- installed some other way (ReaPack, a copy): there, but the version is unknown
  local main = MainScriptPath(p)
  if main and Exists(main) then return 'installed' end
  return nil
end

local function IsDev(v) return v == 'development version' end

-- newest release when there is one
local function Latest(p) return p.releases[1] and p.releases[1].tag or nil end

local function UpdateAvailable(p)
  local inst, latest = p.installed, Latest(p)
  if not inst or not latest or IsDev(inst) or inst == 'installed' then return false end
  return inst ~= latest
end

---------------------------------------------------------------------------------------------------
-- Licenses: each script is its own purchase, so each has its own key. The key lives where the
-- script itself reads it (its license ExtState section), so a key typed in either place counts.
---------------------------------------------------------------------------------------------------

local function StoredKey(p)
  local k = p.licenseSection and r.GetExtState(p.licenseSection, 'licenseKey') or ''
  if k == '' then k = r.GetExtState(EXT, 'key_' .. p.id) end
  if k == '' then k = r.GetExtState(EXT, 'licenseKey') end -- the 2.0 installer's one key
  return (k:gsub('%s', ''))
end

local function CheckLicense(p)
  p.key = StoredKey(p)
  p.keyInput = p.keyInput or p.key
  if p.key == '' then p.lic = { status = 'none' } return end
  local data, err, body = Api(VERIFY_URL, { licenseKey = p.key, product = p.id })
  if data and (data.status == 'active' or data.status == 'trial') then
    p.lic = { status = data.status, expiresAt = data.expiresAt }
  elseif not data and not body then
    -- offline: what the script last saw
    local st = p.licenseSection and r.GetExtState(p.licenseSection, 'status') or ''
    p.lic = { status = st ~= '' and st or 'none', offline = true }
  else
    local reason = (body and (body.reason or body.error)) or err
    -- the 2.0 installer's shared key may belong to the other script: then this one has none
    if tostring(reason):find('Each script needs its own license') and r.GetExtState(EXT, 'key_' .. p.id) == ''
      and (not p.licenseSection or r.GetExtState(p.licenseSection, 'licenseKey') == '') then
      p.key, p.keyInput, p.lic = '', '', { status = 'none' }
    else
      p.lic = { status = (body and body.status) or 'invalid', reason = reason }
    end
  end
end

local function Owned(p) return p.lic and p.lic.status == 'active' end
local function HasValidKey(p) return p.lic and (p.lic.status == 'active' or p.lic.status == 'trial') end

-- saves a key that verified for this product, for the manager and for the script
local function UseKey(p, key)
  p.key, p.keyInput = key, key
  r.SetExtState(EXT, 'key_' .. p.id, key, true)
  if p.licenseSection then
    r.SetExtState(p.licenseSection, 'licenseKey', key, true)
    if S.email ~= '' and r.GetExtState(p.licenseSection, 'email') == '' then
      r.SetExtState(p.licenseSection, 'email', S.email, true)
    end
  end
end

-- The script's own computer ID (made here when the script hasn't run on this computer yet), so
-- signing in here activates this computer for the script: no second sign-in when it starts.
local function DeviceId(p)
  if not p.licenseSection then return '' end
  local id = r.GetExtState(p.licenseSection, 'deviceId')
  if id ~= '' then return id end
  math.randomseed(os.time() + math.floor(r.time_precise() * 1000) % 100000)
  local chars, t = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', {}
  for i = 1, 16 do local n = math.random(1, #chars) t[i] = chars:sub(n, n) end
  math.randomseed()
  id = table.concat(t)
  r.SetExtState(p.licenseSection, 'deviceId', id, true)
  return id
end

-- "Sign in with browser": the site's /link page signs the person in (Google, password or an
-- emailed link), offers the free trial when they have no license, and this computer gets the key.
local function StopLink(p, kind, text)
  p.link = nil
  if text then p.msg = { kind = kind, text = text } end
end

local function StartLink(p)
  p.msg = nil
  local job = AsyncPost(LINK_URL, { action = 'link-start', product = p.id })
  if not job then return StopLink(p, 'err', 'Couldn\'t start the sign-in. Try again.') end
  p.link = { phase = 'starting', job = job, fails = 0 }
end

local function Linked(p, data)
  local key = tostring(data.licenseKey or ''):gsub('%s', '')
  if key == '' then return StopLink(p, 'err', 'The server sent an unexpected answer. Try again.') end
  p.link = nil
  if data.email and data.email ~= '' then
    S.email = data.email
    r.SetExtState(EXT, 'email', data.email, true)
  end
  UseKey(p, key)
  if p.licenseSection then
    r.SetExtState(p.licenseSection, 'email', S.email or '', true)
    r.SetExtState(p.licenseSection, 'lastCheck', '0', true) -- the script checks the new key on its next start
  end
  local st = data.licenseStatus == 'trial' and 'trial' or 'active'
  p.lic = { status = st, expiresAt = data.expiresAt }
  p.showKey = false
  p.msg = { kind = 'ok', text = st == 'active' and ('Signed in. Your ' .. p.name .. ' license is ready on this computer.')
    or ('Free trial ready: ' .. (DaysLeft(data.expiresAt) or 30) .. ' days of ' .. p.name .. '.') }
end

local function LinkAnswer(p, k, data)
  local now = os.time()
  if not data then -- no answer: try again a few times
    k.fails = k.fails + 1
    if k.phase == 'starting' or k.fails >= 15 then
      return StopLink(p, 'err', 'Couldn\'t reach coolreaperscripts.com. Check your internet connection and try again.')
    end
    k.nextPoll = now + 4
    return
  end
  k.fails = 0
  if k.phase == 'starting' then
    if not (data.deviceCode and data.userCode and data.url) then
      return StopLink(p, 'err', data.error or 'Sign-in isn\'t available right now. Try again in a moment.')
    end
    k.deviceCode, k.userCode, k.url = data.deviceCode, data.userCode, data.url
    k.phase, k.expires, k.nextPoll = 'waiting', now + (tonumber(data.expiresIn) or 600), now + 3
    OpenUrl(k.url)
    return
  end
  local st = data.status
  if st == 'linked' then return Linked(p, data)
  elseif st == 'limit' then k.phase, k.email, k.nextPoll = 'limit', data.email, now + 3
  elseif st == 'no-license' then k.phase, k.email, k.nextPoll = 'nolicense', data.email, now + 3
  elseif st == 'pending' then k.nextPoll = now + 2
  elseif st == 'error' then StopLink(p, 'err', data.error or 'Couldn\'t activate this computer. Try again.')
  elseif st == 'expired' then StopLink(p, 'warn', 'The sign-in link expired. Click Sign in with browser to try again.')
  else StopLink(p, 'err', data.error or 'The sign-in link isn\'t valid anymore. Click Sign in with browser to try again.') end
end

local function LinkTick(p)
  local k = p.link
  if not k then return end
  if k.job then
    local data = AsyncResult(k.job)
    if data == nil then return end
    k.job = nil
    return LinkAnswer(p, k, data)
  end
  local now = os.time()
  if k.expires and now > k.expires then
    return StopLink(p, 'warn', 'The sign-in link expired. Click Sign in with browser to try again.')
  end
  if k.nextPoll and now >= k.nextPoll then
    k.job = AsyncPost(LINK_URL, { action = 'link-poll', deviceCode = k.deviceCode, deviceId = DeviceId(p) })
    if not k.job then k.nextPoll = now + 4 end
  end
end

---------------------------------------------------------------------------------------------------
-- Loading the script list
---------------------------------------------------------------------------------------------------

local function LoadProducts()
  local list, err = Api(API, { action = 'products', client = CLIENT })
  if not list then S.msg = { kind = 'err', text = err } S.loaded = true return end
  local old = {}
  for _, p in ipairs(S.products) do old[p.id] = p end
  S.products = {}
  for _, p in ipairs(list.products or {}) do
    local prev = old[p.id]
    local rel = Api(API, { action = 'releases', product = p.id })
    p.releases = {}
    for _, x in ipairs(rel and rel.releases or {}) do
      -- version-like tags only ("1.08", "v1.02", "Ver0.9"); a few early releases have none
      if not x.prerelease and tostring(x.tag):match('^%a*%d') then p.releases[#p.releases + 1] = x end
    end
    p.branch = rel and rel.branch or 'main'
    p.choice = 1 -- newest release, or the development version when there are none
    p.installed = InstalledVersion(p)
    if p.installed and IsDev(p.installed) then p.choice = #p.releases + 1 end
    if prev then p.keyInput, p.showKey, p.link = prev.keyInput, prev.showKey, prev.link end
    CheckLicense(p)
    -- a script with no releases needs a key; show where to put it
    if #p.releases == 0 and not HasValidKey(p) and p.showKey == nil then p.showKey = true end
    S.products[#S.products + 1] = p
  end
  S.loaded = true
end

---------------------------------------------------------------------------------------------------
-- Installing: one file per frame so the window keeps redrawing
---------------------------------------------------------------------------------------------------

local function ChosenRef(p)
  local rel = p.releases[p.choice]
  if rel then return rel.tag, 'Version ' .. rel.tag end
  return p.branch, 'Development version'
end

local function StartsWith(s, prefix) return s:sub(1, #prefix) == prefix end

-- where a repo file goes: the main script under its installed name, routed folders (JSFX into
-- Effects), everything else under the script's folder
local function TargetFor(p, path)
  if p.mainScript and path == p.mainScript.from then return InstallPath(p, p.mainScript.to) end
  for _, rt in ipairs(p.routes or {}) do
    if StartsWith(path, rt.from) then return NativePath(RES .. '/' .. rt.to .. path:sub(#rt.from + 1)) end
  end
  return InstallPath(p, path)
end

local function IsUserData(p, path)
  for _, u in ipairs(p.userData or {}) do
    if path == u or StartsWith(path, u .. '/') then return true end
  end
  return false
end

-- A developer's working copy (a git checkout, or a folder symlinked into one, like FX Devices'
-- JSFX folder on bryan's machine) must never be overwritten by a download.
local function IsSymlink(path)
  if IS_WIN then return false end
  local ok = os.execute('test -L ' .. ShellQuote(path))
  return ok == true or ok == 0
end

local function DevCheckoutIn(p)
  local dirs = { p.installDir }
  if p.mainScript then
    local sub = p.mainScript.to:match('^(.*)/[^/]*$')
    if sub then dirs[#dirs + 1] = p.installDir .. '/' .. sub end
  end
  for _, rt in ipairs(p.routes or {}) do
    local d = rt.to:gsub('/+$', '')
    while d and d:find('/') do
      dirs[#dirs + 1] = d
      d = d:match('^(.*)/[^/]*$')
    end
  end
  -- the repo's own main script sits next to the installed one only in a developer's folder
  -- (installs always rename it)
  if p.mainScript and p.mainScript.from ~= p.mainScript.to and Exists(InstallPath(p, p.mainScript.from)) then
    return NativePath(p.installDir)
  end
  for _, d in ipairs(dirs) do
    local full = NativePath(RES .. '/' .. d)
    if IsSymlink(full) or Exists(full .. SEP .. '.git' .. SEP .. 'HEAD') or Exists(full .. SEP .. '.git') then
      return NativePath(d)
    end
  end
end

local function StartInstall(p)
  local dev = DevCheckoutIn(p)
  if dev then
    p.msg = { kind = 'warn', text = dev .. ' is a development checkout (a git folder or a link to one), so the Script Manager won\'t install over it.' }
    return
  end
  local ref, label = ChosenRef(p)
  -- every download needs a license or trial key (the site stamps each copy with the key it went to)
  if not HasValidKey(p) then
    p.showKey = true
    p.msg = { kind = 'info', text = 'Sign in to install ' .. p.name .. '. No license yet? The sign-in page starts your free 30-day trial.' }
    return
  end
  local list, err = Api(API, { action = 'files', product = p.id, licenseKey = p.key, ref = ref })
  if not list then p.msg = { kind = 'err', text = Friendly(err) } return end
  local queue = {}
  for _, f in ipairs(list.files or {}) do
    local target = TargetFor(p, f.path)
    if not (IsUserData(p, f.path) and Exists(target)) then
      queue[#queue + 1] = { path = f.path, target = target, size = f.size }
    end
  end
  if #queue == 0 then p.msg = { kind = 'err', text = 'Nothing to install.' } return end
  p.msg = nil
  S.job = { p = p, ref = ref, label = label, queue = queue, n = 0, failed = {} }
end

local function InstallNext(job)
  local item = job.queue[job.n + 1]
  job.n = job.n + 1
  r.RecursiveCreateDirectory(DirOf(item.target), 0)
  local tmp = item.target .. '.download'
  os.remove(tmp)
  local code, _, err = Post(API, { action = 'download', product = job.p.id, licenseKey = job.p.key, path = item.path, ref = job.ref }, tmp)
  local data = ReadFile(tmp)
  if code == 200 and data and (#data > 0 or (item.size or 0) == 0) then
    os.remove(item.target)
    if os.rename(tmp, item.target) then return end
    err = 'could not replace the file (is it open somewhere?)'
  end
  os.remove(tmp)
  local why = err
  if not why or why == '' then
    local j = data and JsonDecode(data)
    why = (type(j) == 'table' and j.error) or ('HTTP ' .. tostring(code))
  end
  job.failed[#job.failed + 1] = { path = item.path, why = why }
end

local function FinishInstall(job)
  local p = job.p
  local main = MainScriptPath(p)
  if main and Exists(main) then r.AddRemoveReaScript(true, 0, main, true) end
  -- the scripts' own updaters read the installed release from version.txt
  if job.ref ~= p.branch then
    WriteFile(InstallPath(p, 'version.txt'), 'release: ' .. job.ref .. '\n')
  end
  r.SetExtState(EXT, 'installed_' .. p.id, job.ref ~= p.branch and job.ref or 'development version', true)
  -- the script activates this computer with these on its first start (no key typing needed)
  if p.licenseSection and p.key ~= '' and r.GetExtState(p.licenseSection, 'licenseKey') == '' then
    r.SetExtState(p.licenseSection, 'licenseKey', p.key, true)
    if S.email ~= '' then r.SetExtState(p.licenseSection, 'email', S.email, true) end
  end
  p.installed = InstalledVersion(p)
  local ok = #job.failed == 0
  local lines = {}
  for i, f in ipairs(job.failed) do
    if i > 4 then lines[#lines + 1] = '...' break end
    lines[#lines + 1] = f.path .. ': ' .. tostring(f.why):sub(1, 100)
  end
  p.msg = ok and { kind = 'ok', text = job.label .. ' installed (' .. #job.queue .. ' files). To update it or get other scripts later, open '
      .. p.name .. '\'s settings and click Scripts and updates. You won\'t need the downloaded Script Manager again.' }
    or { kind = 'warn', text = ('Installed %d of %d files; %d failed. Install again to retry.\n'):format(#job.queue - #job.failed, #job.queue, #job.failed) .. table.concat(lines, '\n') }
  S.job = nil
  -- next one of "Update all"
  if S.updateAll and #S.updateAll > 0 then StartInstall(table.remove(S.updateAll, 1)) end
end

local function RunScript(p)
  local main = MainScriptPath(p)
  if not (main and Exists(main)) then return end
  local cmd = r.AddRemoveReaScript(true, 0, main, true)
  if cmd and cmd ~= 0 then
    r.Main_OnCommand(cmd, 0)
    S.close = true
  end
end

---------------------------------------------------------------------------------------------------
-- The Monolith look (FX Devices' settings window, after the website): black, hairlines, square
-- corners, letter-spaced mono caps, Anton titles with a chrome sheen, one green accent.
---------------------------------------------------------------------------------------------------

local ctx = im.CreateContext(TITLE)

-- 0xRRGGBBAA, from the site: --page #000, --acc #49cc85, --ink #f2f2f2 / #9a9a9a / #5f5f5f,
-- --line rgba(255,255,255,.12) / .2
local P = {
  page = 0x000000FF, card = 0x0A0A0AFF, acc = 0x49CC85FF, accHvr = 0x5FDA97FF,
  ink = 0xF2F2F2FF, ink2 = 0x9A9A9AFF, ink3 = 0x5F5F5FFF,
  line = 0xFFFFFF1F, line2 = 0xFFFFFF33, soft = 0xFFFFFF12, guide = 0xFFFFFF0B,
  amber = 0xF6C344FF, red = 0xEF5A5AFF, blue = 0x72A8FFFF,
}

local function A(c, a) return (c & 0xFFFFFF00) | (math.floor(a) & 0xFF) end
local function Mix(a, b, t)
  local function ch(c, s) return (c >> s) & 0xFF end
  local function m(s) return math.floor(ch(a, s) + (ch(b, s) - ch(a, s)) * t + 0.5) end
  return (m(24) << 24) | (m(16) << 16) | (m(8) << 8) | m(0)
end

local F = { body = im.CreateFont('sans-serif', 13), bodyB = im.CreateFont('sans-serif', 13, im.FontFlags_Bold) }
local function LoadFont(key, file, sz)
  local path = FONT_DIR .. SEP .. file
  if Exists(path) then F[key] = im.CreateFont(path, sz) end
end
for _, sz in ipairs({ 18, 22, 26, 36 }) do LoadFont('anton' .. sz, 'Anton-Regular.ttf', sz) end
for _, sz in ipairs({ 10, 11, 13 }) do
  LoadFont('mono' .. sz, 'JetBrainsMono-Medium.ttf', sz)
  LoadFont('monoB' .. sz, 'JetBrainsMono-SemiBold.ttf', sz)
end
for _, sz in ipairs({ 18, 22, 26, 36 }) do F['antonFB' .. sz] = F['anton' .. sz] or im.CreateFont('sans-serif', math.min(sz, 22), im.FontFlags_Bold) end
for _, sz in ipairs({ 10, 11, 13 }) do
  F['monoF' .. sz] = F['mono' .. sz] or im.CreateFont('monospace', sz)
  F['monoBF' .. sz] = F['monoB' .. sz] or im.CreateFont('monospace', sz, im.FontFlags_Bold)
end
local attached = {}
for _, f in pairs(F) do
  if not attached[f] then im.Attach(ctx, f) attached[f] = true end
end
local function F_Anton(sz) return F['antonFB' .. sz] end
local function F_Mono(sz, bold) return F[(bold and 'monoBF' or 'monoF') .. sz] end
-- the fallback fonts are smaller than asked; draw them at their own size
local function FontSize(font, sz)
  if font == F['antonFB' .. sz] and not F['anton' .. sz] then return math.min(sz, 22) end
  return sz
end

local WCache = {}
local function TextW(s, font)
  local k = tostring(font) .. s
  local w = WCache[k]
  if not w then
    im.PushFont(ctx, font)
    w = im.CalcTextSize(ctx, s)
    im.PopFont(ctx)
    WCache[k] = w
  end
  return w
end

local function Txt(dl, font, sz, x, y, c, s) im.DrawList_AddTextEx(dl, font, FontSize(font, sz), x, y, c, s) end

-- letter-spaced caps (the site's mono labels)
local function Mono_Caps(dl, sz, x, y, c, s, bold)
  local font, sp = F_Mono(sz, bold), sz * 0.12
  for _, cp in utf8.codes(tostring(s):upper()) do
    local ch = utf8.char(cp)
    Txt(dl, font, sz, x, y, c, ch)
    x = x + TextW(ch, font) + sp
  end
  return x - sp
end
local function Mono_Caps_W(sz, s, bold)
  local font, sp, w, n = F_Mono(sz, bold), sz * 0.12, 0, 0
  for _, cp in utf8.codes(tostring(s):upper()) do w = w + TextW(utf8.char(cp), font); n = n + 1 end
  return w + math.max(0, n - 1) * sp
end

-- display text with the site's chrome sheen, painted in vertical bands
local CHROME = { { 0, 0x6B6B6BFF }, { .22, 0xF5F5F5FF }, { .38, 0x8A8A8AFF }, { .52, 0xFFFFFFFF }, { .70, 0x707070FF }, { 1, 0xE8E8E8FF } }
local function Chrome_At(t)
  for i = 2, #CHROME do
    local a, b = CHROME[i - 1], CHROME[i]
    if t <= b[1] then return Mix(a[2], b[2], (t - a[1]) / (b[1] - a[1])) end
  end
  return CHROME[#CHROME][2]
end
local function Chrome_Text(dl, font, sz, x, y, s)
  local w = TextW(s, font)
  local BANDS = 28
  local bw = w / BANDS
  for i = 0, BANDS - 1 do
    im.DrawList_PushClipRect(dl, x + i * bw, y - 2, x + (i + 1) * bw + 0.5, y + sz * 1.5, true)
    Txt(dl, font, sz, x, y, Chrome_At((i + 0.5) / BANDS), s)
    im.DrawList_PopClipRect(dl)
  end
  return w
end

-- split s into lines no wider than w (words are never broken)
local function Wrap(s, font, w)
  local lines = {}
  for para in (tostring(s) .. '\n'):gmatch('(.-)\n') do
    local cur = ''
    for word in para:gmatch('%S+') do
      local cand = cur == '' and word or (cur .. ' ' .. word)
      if cur ~= '' and TextW(cand, font) > w then
        lines[#lines + 1] = cur
        cur = word
      else
        cur = cand
      end
    end
    lines[#lines + 1] = cur
  end
  return lines
end

local function Hand() im.SetMouseCursor(ctx, im.MouseCursor_Hand) end

-- reserve w x h at x, y as an invisible button
local function Hit(id, x, y, w, h, disabled)
  im.SetCursorScreenPos(ctx, x, y)
  local clicked = im.InvisibleButton(ctx, id, math.max(1, w), math.max(1, h))
  if disabled then return false, false, false end
  local hov, held = im.IsItemHovered(ctx), im.IsItemActive(ctx)
  if hov then Hand() end
  return clicked, hov, held
end

local BTN_H = 30
local function Btn_W(label) return Mono_Caps_W(10, label, true) + 32 end
-- kind 'go' = white fill (green on hover), 'buy' = green fill, otherwise the site's ghost button
local function Btn(id, label, x, y, kind, w, disabled)
  local dl = im.GetWindowDrawList(ctx)
  w = w or Btn_W(label)
  local clicked, hov, held = Hit(id, x, y, w, BTN_H, disabled)
  local tc
  if disabled then
    im.DrawList_AddRect(dl, x, y, x + w, y + BTN_H, P.soft)
    tc = P.ink3
  elseif kind == 'go' then
    im.DrawList_AddRectFilled(dl, x, y, x + w, y + BTN_H, (hov or held) and P.acc or 0xFFFFFFFF)
    tc = 0x000000FF
  elseif kind == 'buy' then
    im.DrawList_AddRectFilled(dl, x, y, x + w, y + BTN_H, (hov or held) and P.accHvr or P.acc)
    tc = 0x000000FF
  else
    if held then im.DrawList_AddRectFilled(dl, x, y, x + w, y + BTN_H, 0xFFFFFF14) end
    im.DrawList_AddRect(dl, x, y, x + w, y + BTN_H, hov and 0xFFFFFF80 or P.line2)
    tc = P.ink
  end
  local yo = held and 1 or 0
  Mono_Caps(dl, 10, x + (w - Mono_Caps_W(10, label, true)) / 2, y + (BTN_H - 10) / 2 - 1 + yo, tc, label, true)
  return clicked
end

-- status badge: mono caps in the status colour, square outline
local BADGE_H = 20
local function Badge_W(label) return Mono_Caps_W(10, label, true) + 16 end
local function Badge(dl, x, y, label, c)
  local w = Badge_W(label)
  im.DrawList_AddRectFilled(dl, x, y, x + w, y + BADGE_H, A(c, 0x14))
  im.DrawList_AddRect(dl, x, y, x + w, y + BADGE_H, A(c, 0x80))
  Mono_Caps(dl, 10, x + 8, y + (BADGE_H - 10) / 2 - 1, c, label, true)
  return w
end

-- mono caps text link; returns clicked
local function Link(id, dl, x, y, label, c)
  local w = Mono_Caps_W(10, label, true)
  local clicked, hov = Hit(id, x, y - 2, w, 14)
  Mono_Caps(dl, 10, x, y, hov and P.ink or (c or P.ink2), label, true)
  if hov then im.DrawList_AddLine(dl, x, y + 12, x + w, y + 12, P.ink, 1) end
  return clicked, w
end

-- "01  SCRIPTS": green Anton number + letter-spaced mono caps (the site's .kicker)
local function Kicker(dl, x, y, n, txt)
  local num = string.format('%02d', n)
  Txt(dl, F_Anton(18), 18, x, y, P.acc, num)
  Mono_Caps(dl, 10, x + TextW(num, F_Anton(18)) + 10, y + 5, P.ink2, txt)
end

local function Spinner(dl, x, y, text)
  local t = im.GetTime(ctx)
  for i = 0, 2 do
    local a = 0.25 + 0.75 * math.max(0, math.sin(t * 5 - i * 0.8))
    im.DrawList_AddRectFilled(dl, x + i * 9, y + 3, x + i * 9 + 5, y + 8, A(P.acc, a * 255))
  end
  Mono_Caps(dl, 10, x + 36, y, P.ink2, text)
end

-- a message: tinted box with a coloured edge, wrapped text; returns its height
local function Banner_H(text, w) return #Wrap(text, F.body, w - 28) * 16 + 18 end
local function Banner(dl, x, y, w, kind, text)
  local color = (kind == 'err' and P.red) or (kind == 'ok' and P.acc) or (kind == 'warn' and P.amber) or P.blue
  local lines = Wrap(text, F.body, w - 28)
  local h = #lines * 16 + 18
  im.DrawList_AddRectFilled(dl, x, y, x + w, y + h, A(color, 0x12))
  im.DrawList_AddRect(dl, x, y, x + w, y + h, A(color, 0x55))
  im.DrawList_AddRectFilled(dl, x, y, x + 2, y + h, color)
  for i, l in ipairs(lines) do Txt(dl, F.body, 13, x + 14, y + 9 + (i - 1) * 16, P.ink, l) end
  return h
end

-- the site's logo mark: a device with its title column and a knob, 30 px
local function Logo_Mark(dl, x, y)
  local s = 30 / 34
  local function X(v) return x + v * s end
  local function Y(v) return y + v * s end
  im.DrawList_AddRectFilled(dl, X(1.5), Y(3.5), X(32.5), Y(30.5), 0x1A1C20FF, 5 * s)
  im.DrawList_AddRectFilled(dl, X(1.5), Y(3.5), X(10.5), Y(30.5), 0x25282EFF, 5 * s, im.DrawFlags_RoundCornersLeft)
  im.DrawList_AddRect(dl, X(1.5), Y(3.5), X(32.5), Y(30.5), 0xFFFFFF24, 5 * s)
  im.DrawList_AddCircle(dl, X(6), Y(9), 2.2 * s, P.acc, 0, 1.2)
  local cx, cy, rr = X(22), Y(18.4), 5.6 * s
  im.DrawList_PathArcTo(dl, cx, cy, rr, math.pi * 0.75, math.pi * 2.25)
  im.DrawList_PathStroke(dl, 0x0C0D10FF, 0, 2.2 * s)
  im.DrawList_PathArcTo(dl, cx, cy, rr, math.pi * 0.75, math.pi * 1.45)
  im.DrawList_PathStroke(dl, P.acc, 0, 2.2 * s)
  im.DrawList_AddCircleFilled(dl, cx, cy, 3.2 * s, 0x2C2F36FF)
end

-- the knob ring from the site's hero, as a corner ornament
local function Ring(dl, cx, cy, rad)
  im.DrawList_AddCircle(dl, cx, cy, rad * 1.2, 0xFFFFFF0F, 64, 1)
  for k = 0, 59 do
    local a = k / 60 * math.pi * 2
    local r1, r2 = rad - 3, rad + 3
    im.DrawList_AddLine(dl, cx + math.cos(a) * r1, cy + math.sin(a) * r1, cx + math.cos(a) * r2, cy + math.sin(a) * r2, 0xFFFFFF1C, 1)
  end
  im.DrawList_PathArcTo(dl, cx, cy, rad, math.pi * 0.75, math.pi * 1.6, 40)
  im.DrawList_PathStroke(dl, A(P.acc, 0x99), 0, 1.5)
  im.DrawList_AddCircle(dl, cx, cy, rad * 0.78, 0xFFFFFF0D, 64, 1)
  local a = math.pi * 1.6
  im.DrawList_AddLine(dl, cx + math.cos(a) * rad * 0.38, cy + math.sin(a) * rad * 0.38,
    cx + math.cos(a) * rad * 0.72, cy + math.sin(a) * rad * 0.72, 0xFFFFFF5A, 1.6)
end

-- a card's background with the green corner ticks
local function Card_Bg(dl, x, y, w, h)
  im.DrawList_AddRectFilled(dl, x, y, x + w, y + h, P.card)
  im.DrawList_AddRect(dl, x, y, x + w, y + h, P.line)
  local t = 6
  for _, c in ipairs({ { x, y, 1, 1 }, { x + w, y, -1, 1 }, { x, y + h, 1, -1 }, { x + w, y + h, -1, -1 } }) do
    im.DrawList_AddLine(dl, c[1], c[2], c[1] + t * c[3], c[2], P.acc, 1)
    im.DrawList_AddLine(dl, c[1], c[2], c[1], c[2] + t * c[4], P.acc, 1)
  end
end

-- ImGui widgets (inputs, the version list) dressed to match: square, black, hairline border
local function Widgets_Push()
  im.PushStyleVar(ctx, im.StyleVar_FrameRounding, 0)
  im.PushStyleVar(ctx, im.StyleVar_FramePadding, 8, 7)
  im.PushStyleVar(ctx, im.StyleVar_FrameBorderSize, 1)
  im.PushStyleVar(ctx, im.StyleVar_PopupRounding, 0)
  im.PushStyleVar(ctx, im.StyleVar_PopupBorderSize, 1)
  im.PushStyleColor(ctx, im.Col_FrameBg, 0x000000FF)
  im.PushStyleColor(ctx, im.Col_FrameBgHovered, 0x111111FF)
  im.PushStyleColor(ctx, im.Col_FrameBgActive, 0x111111FF)
  im.PushStyleColor(ctx, im.Col_PopupBg, 0x0A0A0AFF)
  im.PushStyleColor(ctx, im.Col_Header, 0xFFFFFF14)
  im.PushStyleColor(ctx, im.Col_HeaderHovered, 0xFFFFFF1F)
  im.PushStyleColor(ctx, im.Col_HeaderActive, A(P.acc, 0x55))
  im.PushStyleColor(ctx, im.Col_Button, 0x000000FF)
  im.PushStyleColor(ctx, im.Col_ButtonHovered, 0x111111FF)
  im.PushStyleColor(ctx, im.Col_Text, P.ink)
  im.PushStyleColor(ctx, im.Col_TextSelectedBg, A(P.acc, 0x55))
end
local function Widgets_Pop()
  im.PopStyleColor(ctx, 11)
  im.PopStyleVar(ctx, 5)
end

---------------------------------------------------------------------------------------------------
-- Window parts
---------------------------------------------------------------------------------------------------

local HEADER_H, PAD, CARD_PX, CARD_PY = 62, 28, 18, 16
local CardH = {}

local function Header(dl, x, y, w)
  im.DrawList_AddLine(dl, x, y + HEADER_H, x + w, y + HEADER_H, P.line, 1)
  Logo_Mark(dl, x + 20, y + (HEADER_H - 30) / 2)
  local tx = x + 62
  local fa = F_Anton(22)
  Txt(dl, fa, 22, tx, y + (HEADER_H - 22) / 2 - 3, P.ink, 'COOL REAPER SCRIPTS')
  local sx = tx + TextW('COOL REAPER SCRIPTS', fa) + 14
  im.DrawList_AddLine(dl, sx, y + 22, sx, y + HEADER_H - 22, P.line2, 1)
  Mono_Caps(dl, 11, sx + 14, y + (HEADER_H - 11) / 2 - 1, P.ink2, 'Script Manager')

  -- close
  local cs = 30
  local cx, cy = x + w - 18 - cs, y + (HEADER_H - cs) / 2
  local clicked, hov = Hit('##close', cx, cy, cs, cs)
  im.DrawList_AddRect(dl, cx, cy, cx + cs, cy + cs, hov and 0xFFFFFF80 or P.line2)
  local cc, k = hov and P.ink or P.ink2, 4.5
  im.DrawList_AddLine(dl, cx + cs / 2 - k, cy + cs / 2 - k, cx + cs / 2 + k, cy + cs / 2 + k, cc, 1.4)
  im.DrawList_AddLine(dl, cx + cs / 2 + k, cy + cs / 2 - k, cx + cs / 2 - k, cy + cs / 2 + k, cc, 1.4)
  if clicked then S.close = true end

  -- update all, right to left from the close button
  local rx = cx - 12
  local pending = {}
  for _, p in ipairs(S.products) do if UpdateAvailable(p) then pending[#pending + 1] = p end end
  if #pending > 0 and not S.job and not S.busy then
    local label = 'Update all (' .. #pending .. ')'
    local bw = Btn_W(label)
    if Btn('##updall', label, rx - bw, y + (HEADER_H - BTN_H) / 2, 'go', bw) then
      for _, p in ipairs(pending) do p.choice = 1 end
      S.updateAll = pending
      Busy('Getting the file list...', function() StartInstall(table.remove(S.updateAll, 1)) end)
    end
  end
end

local function StatusBadge(p)
  local st = p.lic and p.lic.status or 'none'
  if st == 'active' then return 'Owned', P.acc end
  if st == 'trial' then
    local d = DaysLeft(p.lic.expiresAt)
    return 'Trial' .. (d and (' \194\183 ' .. d .. (d == 1 and ' day' or ' days')) or ''), P.amber
  end
  if st == 'expired' then return 'Trial ended', P.red end
  if st == 'invalid' or st == 'revoked' then return 'Key not valid', P.red end
  return 'Not owned', P.ink2
end

local function VersionLine(p)
  local parts = {}
  if not p.installed then parts[#parts + 1] = 'Not installed'
  elseif p.installed == 'installed' then parts[#parts + 1] = 'Installed \194\183 version unknown'
  elseif IsDev(p.installed) then parts[#parts + 1] = 'Installed \194\183 dev build'
  else parts[#parts + 1] = 'Installed \194\183 v' .. p.installed:gsub('^[vV]', '') end
  local latest = Latest(p)
  if latest then parts[#parts + 1] = 'Latest \194\183 v' .. latest:gsub('^[vV]', '')
  else parts[#parts + 1] = 'No release yet' end
  return table.concat(parts, '     ')
end

local function VersionCombo(p, w)
  local _, label = ChosenRef(p)
  local preview = p.releases[p.choice] and (label .. (p.choice == 1 and ' (newest)' or '')) or label
  im.SetNextItemWidth(ctx, w)
  im.PushFont(ctx, F.body)
  if im.BeginCombo(ctx, '##ver' .. p.id, preview) then
    for j, rel in ipairs(p.releases) do
      local about = (rel.name or ''):gsub('^v?' .. rel.tag:gsub('%p', '%%%0') .. '%s*[-:]*%s*', '')
      if about:match('^%a*%d[%d%.]*$') then about = '' end -- just the version again
      if #about > 40 then about = about:sub(1, 38) .. '...' end
      local text = 'Version ' .. rel.tag .. (j == 1 and ' (newest)' or '') .. (about ~= '' and ('  \194\183  ' .. about) or '')
      if im.Selectable(ctx, text .. '##' .. j, p.choice == j) then p.choice = j end
    end
    if not (p.releasesOnly and #p.releases > 0)
      and im.Selectable(ctx, 'Development version' .. (HasValidKey(p) and '' or '  (needs a key)'), p.choice > #p.releases) then
      p.choice = #p.releases + 1
    end
    im.EndCombo(ctx)
  end
  local rel = p.releases[p.choice]
  if rel and rel.notes and rel.notes ~= '' and im.IsItemHovered(ctx) then
    im.SetTooltip(ctx, rel.notes:sub(1, 600))
  end
  im.PopFont(ctx)
end

local function ProductCard(p, x, y, w)
  local dl = im.GetWindowDrawList(ctx)
  if CardH[p.id] then Card_Bg(dl, x, y, w, CardH[p.id]) end
  local ix, iw = x + CARD_PX, w - CARD_PX * 2
  local cy = y + CARD_PY
  local busy = S.job ~= nil or S.busy ~= nil
  local job = S.job and S.job.p == p and S.job

  -- name and license badge
  local fa = F_Anton(26)
  Txt(dl, fa, 26, ix, cy - 2, P.ink, p.name:upper())
  local label, clr = StatusBadge(p)
  Badge(dl, ix + TextW(p.name:upper(), fa) + 14, cy + 6, label, clr)
  if p.lic and p.lic.offline then
    Mono_Caps(dl, 10, ix + TextW(p.name:upper(), fa) + 14 + Badge_W(label) + 10, cy + 11, P.ink3, 'offline')
  end

  -- buttons on the right: Buy (when not owned), then install / update / reinstall
  local bx = ix + iw
  local primary, kind
  if not p.installed then primary, kind = 'Install', 'go'
  elseif UpdateAvailable(p) and p.choice == 1 then primary, kind = 'Update', 'go'
  elseif IsDev(p.installed) and p.choice > #p.releases then primary, kind = 'Update', 'ghost'
  else primary, kind = 'Reinstall', 'ghost' end
  if p.installed and p.choice ~= 1 and p.releases[p.choice] and p.releases[p.choice].tag ~= p.installed then
    primary, kind = 'Install this version', 'ghost'
  end
  local pw = Btn_W(primary)
  bx = bx - pw
  if Btn('##prim' .. p.id, primary, bx, cy, kind, pw, busy) then
    Busy('Getting the file list...', function() StartInstall(p) end)
  end
  if not Owned(p) then
    local bw = Btn_W('Buy')
    bx = bx - 8 - bw
    if Btn('##buy' .. p.id, 'Buy', bx, cy, 'buy', bw) then OpenUrl(p.buyUrl or (SITE .. '/#pricing')) end
  end
  cy = cy + 36

  -- what it is, and the versions
  if p.description then
    for _, l in ipairs(Wrap(p.description, F.body, iw)) do Txt(dl, F.body, 13, ix, cy, P.ink2, l); cy = cy + 17 end
  end
  cy = cy + 6
  local vline = VersionLine(p)
  Mono_Caps(dl, 10, ix, cy, UpdateAvailable(p) and P.acc or P.ink3, vline)
  if UpdateAvailable(p) then
    Badge(dl, ix + Mono_Caps_W(10, vline) + 12, cy - 5, 'Update', P.acc)
  end
  cy = cy + 22

  -- installing
  if job then
    local n, total = job.n, #job.queue
    im.DrawList_AddRectFilled(dl, ix, cy, ix + iw, cy + 2, P.soft)
    im.DrawList_AddRectFilled(dl, ix, cy, ix + iw * (total > 0 and n / total or 1), cy + 2, P.acc)
    cy = cy + 10
    local item = job.queue[n + 1]
    local text = ('%d / %d  '):format(n, total) .. (item and item.path or 'finishing')
    im.DrawList_PushClipRect(dl, ix, cy - 2, ix + iw, cy + 16, true)
    Mono_Caps(dl, 10, ix, cy, P.ink2, text)
    im.DrawList_PopClipRect(dl)
    cy = cy + 22
  end

  -- message for this script
  if p.msg then
    cy = cy + Banner(dl, ix, cy, iw, p.msg.kind, p.msg.text) + 10
  end

  -- divider, then the version picker, license link and Run
  im.DrawList_AddLine(dl, ix, cy, ix + iw, cy, P.soft, 1)
  cy = cy + 12
  Mono_Caps(dl, 10, ix, cy + 9, P.ink3, 'Version')
  im.SetCursorScreenPos(ctx, ix + 70, cy)
  if busy then im.BeginDisabled(ctx) end
  VersionCombo(p, math.min(260, iw - 260))
  if busy then im.EndDisabled(ctx) end
  local rx = ix + iw
  if p.installed and p.mainScript then
    local rw = Btn_W('Run')
    rx = rx - rw
    if Btn('##run' .. p.id, 'Run', rx, cy, 'ghost', rw, busy) then RunScript(p) end
    rx = rx - 16
  end
  local keyLabel = p.showKey and 'Hide license' or (HasValidKey(p) and 'License' or 'Sign in / free trial')
  local lw = Mono_Caps_W(10, keyLabel, true)
  if Link('##keylink' .. p.id, dl, rx - lw, cy + 9, keyLabel, P.ink2) then
    p.showKey = not p.showKey
    p.msg = nil
  end
  cy = cy + BTN_H + 4

  -- sign-in: the license or free trial comes from the person's account on the site
  if p.showKey or p.link then
    cy = cy + 10
    local k = p.link
    local function Lines(text, c)
      for _, l in ipairs(Wrap(text, F.body, iw)) do Txt(dl, F.body, 13, ix, cy, c or P.ink2, l); cy = cy + 17 end
    end
    if k and k.phase ~= 'starting' then
      if k.phase == 'nolicense' then
        Lines('Signed in as ' .. tostring(k.email) .. ', which has no ' .. p.name .. ' license yet. Start the free trial on that page, or buy a license; this updates by itself.')
      elseif k.phase == 'limit' then
        Lines(tostring(k.email) .. '\'s license is already on 3 computers. Remove one on your account page and this computer is added by itself.', P.amber)
      else
        Lines('Finish signing in in your browser. Your code:')
        cy = cy + 4
        Txt(dl, F_Mono(13, true), 20, ix, cy, P.ink, tostring(k.userCode))
        cy = cy + 30
      end
      cy = cy + 6
      local ow, cw = Btn_W('Open page again'), Btn_W('Cancel')
      if Btn('##open' .. p.id, 'Open page again', ix, cy, 'ghost', ow) then OpenUrl(k.url) end
      if Btn('##cancel' .. p.id, 'Cancel', ix + ow + 8, cy, 'ghost', cw) then StopLink(p) end
      cy = cy + BTN_H + 4
    elseif k then
      Spinner(dl, ix, cy, 'Opening the sign-in page...')
      cy = cy + 24
    elseif HasValidKey(p) then
      Lines((p.lic.status == 'trial' and 'Free trial' or 'License') .. ((S.email or '') ~= '' and (' for ' .. S.email) or '') .. ', saved for ' .. p.name .. ' on this computer.')
      cy = cy + 6
      local bw = Btn_W('Use another account')
      if Btn('##relink' .. p.id, 'Use another account', ix, cy, 'ghost', bw, busy) then StartLink(p) end
      cy = cy + BTN_H + 4
    else
      Lines('Sign in with the account you bought ' .. p.name .. ' with. No license yet? The same page starts your free 30-day trial. This also activates this computer for ' .. p.name .. ' (3 computers per license).')
      cy = cy + 6
      local bw = Btn_W('Sign in with browser')
      if Btn('##link' .. p.id, 'Sign in with browser', ix, cy, 'go', bw, busy) then StartLink(p) end
      cy = cy + BTN_H + 4
    end
  end

  CardH[p.id] = cy + CARD_PY - 4 - y
  im.SetCursorScreenPos(ctx, x, y + CardH[p.id])
  im.Dummy(ctx, w, 0)
  return CardH[p.id]
end

local function ExtensionsCard(x, y, w)
  local dl = im.GetWindowDrawList(ctx)
  if CardH.ext then Card_Bg(dl, x, y, w, CardH.ext) end
  local ix, iw = x + CARD_PX, w - CARD_PX * 2
  local cy = y + CARD_PY - 4
  local toInstall = {}
  for i, e in ipairs(EXTENSIONS) do
    if i > 1 then im.DrawList_AddLine(dl, ix, cy, ix + iw, cy, P.soft, 1) end
    local st = ExtStatus(e)
    local ry = cy + 10
    Txt(dl, F.bodyB, 13, ix, ry + 3, P.ink, e.name)
    Txt(dl, F.body, 13, ix + 130, ry + 3, P.ink2, st == 'restart' and 'Restart REAPER to load it'
      or st == 'outdated' and 'Too old for Vertical FX List: update to the current version' or e.why)
    local label, clr = 'OK', P.acc
    if st == 'restart' then label, clr = 'Restart', P.blue
    elseif st == 'outdated' then label, clr = 'Update', P.amber
    elseif st == 'missing' then label, clr = 'Missing', P.amber end
    Badge(dl, ix + iw - Badge_W(label), ry, label, clr)
    if st == 'missing' or st == 'outdated' then toInstall[#toInstall + 1] = e end
    cy = ry + BADGE_H + 10
  end
  if #toInstall > 0 then
    cy = cy + 4
    local one = toInstall[1]
    local label = #toInstall > 1 and ('Install the ' .. #toInstall .. ' missing extensions')
      or ((ExtStatus(one) == 'outdated' and 'Update ' or 'Install ') .. one.name)
    if Btn('##extinst', label, ix, cy, 'go', nil, S.busy ~= nil) then
      Busy('Downloading extensions...', function()
        local done, failed, restart = InstallExtensions(toInstall)
        S.msg = { kind = #failed > 0 and 'warn' or 'ok', text = ExtensionReport(done, failed, restart) }
      end)
    end
    cy = cy + BTN_H + 6
  end
  CardH.ext = cy + CARD_PY - 6 - y
  im.SetCursorScreenPos(ctx, x, y + CardH.ext)
  im.Dummy(ctx, w, 0)
  return CardH.ext
end

local function Content(cx, cy, avail)
  local dl = im.GetWindowDrawList(ctx)
  local w = math.min(avail - PAD * 2, 640)
  local px = cx + PAD
  Ring(dl, px + w - 40, cy + 62, 34)
  Mono_Caps(dl, 10, px, cy + 26, P.ink3, 'Script Manager  /  v' .. VERSION)
  Chrome_Text(dl, F_Anton(36), 36, px, cy + 42, 'YOUR SCRIPTS')
  Txt(dl, F.body, 13, px, cy + 92, P.ink2, 'Install, update and license Cool Reaper Scripts.')
  local y = cy + 124

  if S.busy then
    Spinner(dl, px, y, S.busy.label)
  end
  y = y + 22
  if S.msg then y = y + Banner(dl, px, y, w, S.msg.kind, S.msg.text) + 14 end

  Kicker(dl, px, y, 1, 'Scripts')
  y = y + 32
  if not S.loaded and #S.products == 0 then
    y = y + 10
  end
  for _, p in ipairs(S.products) do
    im.PushID(ctx, p.id)
    y = y + ProductCard(p, px, y, w) + 14
    im.PopID(ctx)
  end
  y = y + 12
  Kicker(dl, px, y, 2, 'Free extensions the scripts need')
  y = y + 32
  y = y + ExtensionsCard(px, y, w) + 20

  -- footer
  local c1, w1 = Link('##site', dl, px, y, 'coolreaperscripts.com', P.ink2)
  if c1 then OpenUrl(SITE) end
  if not S.busy and not S.job then
    local c2 = Link('##refresh', dl, px + w1 + 24, y, 'Check for updates', P.ink2)
    if c2 then
      S.msg = nil
      for _, p in ipairs(S.products) do p.msg = nil end
      Busy('Checking for updates...', LoadProducts)
    end
  end
  local by = 'by Bryan Chi'
  Mono_Caps(dl, 10, px + w - Mono_Caps_W(10, by), y, P.ink3, by)
  im.SetCursorScreenPos(ctx, px, y + 40)
  im.Dummy(ctx, w, 0)
end

---------------------------------------------------------------------------------------------------
-- Frame
---------------------------------------------------------------------------------------------------

local function Frame()
  -- one blocking step at a time, after its label has drawn
  if S.busy then
    S.busy.frames = S.busy.frames + 1
    if S.busy.frames >= 3 then
      local fn = S.busy.fn
      S.busy = nil
      fn()
    end
  elseif S.job then
    if S.job.n < #S.job.queue then InstallNext(S.job) else FinishInstall(S.job) end
  end
  for _, p in ipairs(S.products) do LinkTick(p) end

  im.PushStyleVar(ctx, im.StyleVar_WindowPadding, 0, 0)
  im.PushStyleVar(ctx, im.StyleVar_WindowRounding, 0)
  im.PushStyleVar(ctx, im.StyleVar_WindowBorderSize, 1)
  im.PushStyleVar(ctx, im.StyleVar_ItemSpacing, 0, 0)
  im.PushStyleVar(ctx, im.StyleVar_ScrollbarSize, 8)
  im.PushStyleVar(ctx, im.StyleVar_ScrollbarRounding, 0)
  im.PushStyleColor(ctx, im.Col_WindowBg, P.page)
  im.PushStyleColor(ctx, im.Col_ChildBg, 0x00000000)
  im.PushStyleColor(ctx, im.Col_Border, P.line2)
  im.PushStyleColor(ctx, im.Col_ScrollbarBg, 0x00000000)
  im.PushStyleColor(ctx, im.Col_ScrollbarGrab, 0xFFFFFF1F)
  im.PushStyleColor(ctx, im.Col_ScrollbarGrabHovered, 0xFFFFFF38)
  im.PushStyleColor(ctx, im.Col_ScrollbarGrabActive, P.acc)
  Widgets_Push()
  im.PushFont(ctx, F.body)
  im.SetNextWindowSize(ctx, 720, 760, im.Cond_FirstUseEver)
  im.SetNextWindowSizeConstraints(ctx, 600, 420, 1400, 1600)
  local visible, open = im.Begin(ctx, TITLE, true,
    im.WindowFlags_NoCollapse | im.WindowFlags_NoTitleBar | im.WindowFlags_NoScrollbar | im.WindowFlags_NoScrollWithMouse)
  if visible then
    local x, y = im.GetWindowPos(ctx)
    local w, h = im.GetWindowSize(ctx)
    local dl = im.GetWindowDrawList(ctx)
    -- the site's column guides
    for k = 1, 5 do
      local gx = math.floor(x + w * k / 6) + 0.5
      im.DrawList_AddLine(dl, gx, y + HEADER_H, gx, y + h, P.guide, 1)
    end
    Header(dl, x, y, w)
    im.SetCursorScreenPos(ctx, x + 1, y + HEADER_H + 1)
    if im.BeginChild(ctx, '##content', w - 2, h - HEADER_H - 2) then
      local cx, cy = im.GetCursorScreenPos(ctx)
      Content(cx, cy, im.GetContentRegionAvail(ctx))
      im.EndChild(ctx)
    end
    if im.IsWindowFocused(ctx, im.FocusedFlags_RootAndChildWindows) and im.IsKeyPressed(ctx, im.Key_Escape)
      and not im.IsAnyItemActive(ctx) then
      S.close = true
    end
    im.End(ctx)
  end
  im.PopFont(ctx)
  Widgets_Pop()
  im.PopStyleColor(ctx, 7)
  im.PopStyleVar(ctx, 6)
  if open and not S.close then r.defer(Frame) end
end

S.msg = SETUP_NOTE or SETTLE_NOTE
if not S.msg and #MissingExtensions() > 0 then
  S.msg = { kind = 'warn', text = 'Some free extensions the scripts need are missing or too old. Install them at the bottom of this window.' }
end
Busy('Checking your scripts...', LoadProducts)
r.defer(Frame)
