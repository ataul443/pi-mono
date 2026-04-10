/**
 * Detects suspicious Windows path patterns that could bypass security checks.
 *
 * Patterns checked:
 * - NTFS Alternate Data Streams (Windows/WSL only): colon after position 2
 * - 8.3 short names: ~\d pattern (e.g. GIT~1)
 * - Long path prefixes: \\?\, //?/, \\.\, //./
 * - Trailing dots/spaces on path
 * - DOS device names: .git.CON, settings.json.PRN, etc.
 * - Triple dots as path component: /.../
 * - UNC paths: \\server\share, //server/share
 */
export function hasSuspiciousWindowsPattern(path: string): boolean {
	// NTFS Alternate Data Streams: colon after position 2
	// (skips Windows drive letter like C:\)
	// Only relevant on Windows and WSL where the Windows kernel interprets ADS syntax
	if (process.platform === "win32") {
		const colonIndex = path.indexOf(":", 2);
		if (colonIndex !== -1) {
			return true;
		}
	}

	// 8.3 short names: ~\d pattern (e.g. GIT~1, CLAUDE~1, SETTIN~1.JSON)
	if (/~\d/.test(path)) {
		return true;
	}

	// Long path prefixes (both backslash and forward slash variants)
	// Examples: \\?\C:\Users\..., \\.\C:\..., //?/C:/..., //./C:/...
	if (path.startsWith("\\\\?\\") || path.startsWith("\\\\.\\") || path.startsWith("//?/") || path.startsWith("//./")) {
		return true;
	}

	// Trailing dots and spaces (Windows strips these during path resolution)
	// Can bypass string matching if ".git" is blocked but ".git." is used
	if (/[.\s]+$/.test(path)) {
		return true;
	}

	// DOS device names: CON, PRN, AUX, NUL, COM1-9, LPT1-9
	// Examples: .git.CON, settings.json.PRN, .bashrc.AUX
	if (/\.(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(path)) {
		return true;
	}

	// Three or more consecutive dots as a path component
	// Only block when preceded/followed by path separators
	if (/(^|\/|\\)\.{3,}(\/|\\|$)/.test(path)) {
		return true;
	}

	// UNC paths: \\server\share, //server/share
	// Check for paths starting with \\ or // that aren't the long path prefixes above
	if (path.startsWith("\\\\") || path.startsWith("//")) {
		return true;
	}

	return false;
}
