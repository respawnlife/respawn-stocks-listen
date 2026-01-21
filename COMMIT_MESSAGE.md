# Git Commit Message

## Title
feat: Add auto-refresh functionality to K-line charts

## Description
Fix the issue where K-line charts do not automatically refresh after opening, while stock prices continue to update.

## Changes Made
- Added auto-refresh mechanism to KlineChart component
- Implemented 5-minute refresh interval for K-line data
- Added trading hours validation (only refreshes during market hours)
- Added proper cleanup on component unmount
- Added detailed console logging for refresh monitoring

## Technical Details
- Added `refreshIntervalRef` for timer management
- Implemented `useEffect` hook for auto-refresh lifecycle
- Added trading time checks (weekdays 9:30-11:30, 13:00-15:00)
- Integrated with existing `loadKlineData` function
- Follows same patterns as main app auto-refresh system

## Files Modified
- `frontend/src/components/KlineChart.tsx` - Main implementation
- `frontend/src/version.ts` - Version bump
- `docs/` - Updated build artifacts

## Testing
- Build successful with no errors
- Auto-refresh triggers every 5 minutes during trading hours
- Console logs show refresh start/completion
- Proper cleanup when dialog closes

## Impact
Users no longer need to manually refresh K-line charts - they will automatically update every 5 minutes during trading hours.