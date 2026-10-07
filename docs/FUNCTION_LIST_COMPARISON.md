# OutRun function list comparison: iOS vs HarmonyOS

- **Source:** OutRun for iOS 1.3 (upstream tag `v1.3`), 238 functions.
- **Target:** OutRun for HarmonyOS (`etspworks/OutRun-HarmonyOS` main, release 2026-10-07), 181 functions.
- Function lists: `Function_List_OutRun-1.3.xlsx` (iOS) and `Function_List_OutRun-HMOS-20261007-release.xlsx` (HarmonyOS).
- ✅ = the function is in that app's function list, ❌ = it is not.
- The function text comes from the iOS list, or from the HarmonyOS list when iOS lacks it.
- A HarmonyOS function that the iOS list splits into several rows is ticked on each of them.
- 248 rows: 169 in both, 69 iOS only, 10 HarmonyOS only.
- A note with #N points to the row whose function gives the same result.
- Many ❌ rows in the HarmonyOS column are list granularity, not missing features; the note says which.

## Summary by category

| Category | Rows | Both | iOS | HarmonyOS |
|---|---:|---:|---:|---:|
| Start and setup | 31 | 29 (94%) | 2 | 0 |
| Timeline and sorting | 26 | 25 (96%) | 0 | 1 |
| Recording a workout | 27 | 18 (67%) | 9 | 0 |
| Workout details and map | 37 | 22 (59%) | 13 | 2 |
| Editing a workout | 21 | 17 (81%) | 2 | 2 |
| Settings | 54 | 28 (52%) | 23 | 3 |
| Health sync | 19 | 14 (74%) | 4 | 1 |
| Backup and data | 15 | 8 (53%) | 7 | 0 |
| Global and launch | 18 | 8 (44%) | 9 | 1 |
| **Total** | **248** | **169 (68%)** | **69** | **10** |

## All functions

| # | Function | iOS | HarmonyOS | Notes |
|---:|---|:---:|:---:|---|
| 1 | `Start Screen` Tap LET'S GO to open the Setup screen | ✅ | ✅ |  |
| 2 | `Start Screen > Setup` Tap Privacy Policy on the Formalities step to open the Privacy Policy page | ✅ | ✅ |  |
| 3 | `Start Screen > Setup` Tap the Privacy Policy agreement switch to turn agreement on or off; Next stays disabled until both agreement switches are on | ✅ | ✅ |  |
| 4 | `Start Screen > Setup` Tap Terms of Service on the Formalities step to open the Terms of Service page | ✅ | ✅ |  |
| 5 | `Start Screen > Setup` Tap the Terms of Service agreement switch to turn agreement on or off; Next stays disabled until both agreement switches are on | ✅ | ✅ |  |
| 6 | `Start Screen > Setup` Tap Next on the Formalities step to advance to the User Info step | ✅ | ✅ | The HarmonyOS list has one Next row for every step. |
| 7 | `Start Screen > Setup` Type a name into the Username field on the User Info step to set the optional user name | ✅ | ✅ |  |
| 8 | `Start Screen > Setup` Tap Metric or Imperial in Preferred System to select the measurement system | ✅ | ✅ | The HarmonyOS list has one row each for Metric and Imperial. |
| 9 | `Start Screen > Setup` Type a value into the Weight field on the User Info step to set the user weight in the selected unit | ✅ | ✅ |  |
| 10 | `Start Screen > Setup` Tap Next on the User Info step to advance to the Apple Health step | ✅ | ✅ | Same Next row as #6. |
| 11 | `Start Screen > Setup` Tap the Sync Workouts switch on the Apple Health step to turn workout synchronisation with Apple Health on or off | ✅ | ✅ | Huawei Health in the port. |
| 12 | `Start Screen > Setup` Tap the Sync Weight switch on the Apple Health step to turn weight synchronisation with Apple Health on or off | ✅ | ✅ | Huawei Health in the port. |
| 13 | `Start Screen > Setup` Tap the Auto Import Workouts switch on the Apple Health step to turn automatic import of Health workouts on or off | ✅ | ✅ | Huawei Health in the port. |
| 14 | `Start Screen > Setup` Tap Skip (shown as Next when a sync switch is on) on the Apple Health step to advance to the Permissions step | ✅ | ✅ | Same Next row as #6; it reads Skip while neither sync switch is on. |
| 15 | `Start Screen > Setup` Tap Location Permission on the Permissions step to show an info alert about the location permission | ✅ | ✅ |  |
| 16 | `Start Screen > Setup` Tap GRANT on the Location row to request location permission, showing a checkmark when granted or the Location Error Alert when not | ✅ | ✅ |  |
| 17 | `Start Screen > Setup` Tap Motion Access on the Permissions step to show an info alert about the motion permission | ✅ | ✅ |  |
| 18 | `Start Screen > Setup` Tap GRANT on the Motion row to request motion permission, showing a checkmark when granted or the Motion Error Alert when not | ✅ | ✅ |  |
| 19 | `Start Screen > Setup` Tap Health Permission on the Permissions step to show an info alert about the Apple Health permission | ✅ | ✅ |  |
| 20 | `Start Screen > Setup` Tap GRANT on the Apple Health row to request Health access, showing a checkmark when granted or an error alert when not | ✅ | ✅ | Requests Huawei Health authorization. |
| 21 | `Start Screen > Setup` Tap Okay on the permission info alert to dismiss it | ✅ | ❌ | Same alert in the port; the HarmonyOS list folds its Okay into #15, #17 and #19. |
| 22 | `Start Screen > Setup` Tap Okay on the Apple Health error alert to dismiss it | ✅ | ❌ | Same alert in the port; the HarmonyOS list folds its Okay into #20. |
| 23 | `Start Screen > Setup` Tap Finish on the Permissions step to save the setup choices and open the Tab Bar | ✅ | ✅ | Opens the Timeline. |
| 24 | `Start Screen > Setup > Privacy Policy` Tap the Close (X) icon to dismiss the Privacy Policy page | ✅ | ✅ | One Policy page in the port serves both policies. |
| 25 | `Start Screen > Setup > Terms of Service` Tap the Close (X) icon to dismiss the Terms of Service page | ✅ | ✅ | Same Policy page as #24. |
| 26 | `Start Screen > Setup > Location Error Alert` Tap Cancel to dismiss the location permission error alert | ✅ | ✅ |  |
| 27 | `Start Screen > Setup > Location Error Alert` Tap Open to open the iOS Settings app | ✅ | ✅ | HarmonyOS has no link to the app settings page; Open asks for the permission again in the system dialog. |
| 28 | `Start Screen > Setup > Location Restricted Alert` Tap Cancel to dismiss the location access restricted alert | ✅ | ✅ |  |
| 29 | `Start Screen > Setup > Location Restricted Alert` Tap Open to open the iOS Settings app | ✅ | ✅ | Open asks for the permission again in the system dialog. |
| 30 | `Start Screen > Setup > Motion Error Alert` Tap Cancel to dismiss the motion permission error alert | ✅ | ✅ |  |
| 31 | `Start Screen > Setup > Motion Error Alert` Tap Open to open the iOS Settings app | ✅ | ✅ | Open asks for the permission again in the system dialog. |
| 32 | `Tab Bar` Tap the Timeline tab to show the Workout List | ✅ | ✅ | The HarmonyOS list counts this tab bar row again for each page that shows the tab bar. |
| 33 | `Tab Bar` Tap the Settings tab to show the Settings screen | ✅ | ✅ | The HarmonyOS list counts this tab bar row again for each page that shows the tab bar. |
| 34 | `Tab Bar` Tap the + button at the centre of the tab bar to open the New Workout screen | ✅ | ✅ | The HarmonyOS list counts this tab bar row again for each page that shows the tab bar. |
| 35 | `Tab Bar` Long press the + button to open the Workout Type Alert | ✅ | ✅ | The HarmonyOS list counts this tab bar row again for each page that shows the tab bar. |
| 36 | `Workout List` Tap the sort button in the navigation bar (default caption "Date ↓") to open the Sort Popover | ✅ | ✅ |  |
| 37 | `Workout List` Tap a workout row to open the Workout Detail of that workout | ✅ | ✅ |  |
| 38 | `Tab Bar > Workout Type Alert` Tap Running to open the New Workout screen for a running workout | ✅ | ✅ |  |
| 39 | `Tab Bar > Workout Type Alert` Tap Walking to open the New Workout screen for a walking workout | ✅ | ✅ |  |
| 40 | `Tab Bar > Workout Type Alert` Tap Hiking to open the New Workout screen for a hiking workout | ✅ | ✅ |  |
| 41 | `Tab Bar > Workout Type Alert` Tap Cycling to open the New Workout screen for a cycling workout | ✅ | ✅ |  |
| 42 | `Tab Bar > Workout Type Alert` Tap Skating to open the New Workout screen for a skating workout | ✅ | ✅ |  |
| 43 | `Tab Bar > Workout Type Alert` Tap Enter Manually to open the Edit Workout screen for manual entry | ✅ | ✅ |  |
| 44 | `Tab Bar > Workout Type Alert` Tap Cancel to dismiss the Workout Type Alert without starting a workout | ✅ | ✅ |  |
| 45 | `Workout List > Sort Popover` Tap the Type row to open the Type options | ✅ | ✅ |  |
| 46 | `Workout List > Sort Popover` Tap the Is Race switch to filter the workout list to race workouts | ✅ | ✅ |  |
| 47 | `Workout List > Sort Popover` Tap Date to sort the workout list by date | ✅ | ✅ |  |
| 48 | `Workout List > Sort Popover` Tap Distance to sort the workout list by distance | ✅ | ✅ |  |
| 49 | `Workout List > Sort Popover` Tap the Descending switch to reverse the sort order of the workout list | ✅ | ✅ |  |
| 50 | `Workout List > Sort Popover` Tap Done to close the Sort Popover | ✅ | ✅ |  |
| 51 | `Timeline > Sort and Filter` Tap outside the sheet to dismiss the Sort and Filter sheet | ❌ | ✅ | The iOS list does not count a tap outside the popover. |
| 52 | `Workout List > Sort Popover > Type` Tap All to remove the type filter and show workouts of every type | ✅ | ✅ |  |
| 53 | `Workout List > Sort Popover > Type` Tap Running to filter the workout list to Running workouts | ✅ | ✅ |  |
| 54 | `Workout List > Sort Popover > Type` Tap Walking to filter the workout list to Walking workouts | ✅ | ✅ |  |
| 55 | `Workout List > Sort Popover > Type` Tap Hiking to filter the workout list to Hiking workouts | ✅ | ✅ |  |
| 56 | `Workout List > Sort Popover > Type` Tap Cycling to filter the workout list to Cycling workouts | ✅ | ✅ |  |
| 57 | `Workout List > Sort Popover > Type` Tap Skating to filter the workout list to Skating workouts | ✅ | ✅ |  |
| 58 | `Tab Bar > New Workout` Tap the Close (X) icon button while no workout is being recorded to dismiss the New Workout screen | ✅ | ✅ |  |
| 59 | `Tab Bar > New Workout` Tap the Close (X) icon button while a workout is being recorded or paused to open the Close Recording Alert | ✅ | ✅ |  |
| 60 | `Tab Bar > New Workout` Swipe down on the New Workout screen to dismiss it when no workout is being recorded | ✅ | ❌ | Not in the HarmonyOS list; Close gives the same result, #58. |
| 61 | `Tab Bar > New Workout` Drag the map to move the view manually, which shows the Re-Center button and stops the automatic camera follow | ✅ | ✅ |  |
| 62 | `Tab Bar > New Workout` Pinch the map to zoom, which shows the Re-Center button and stops the automatic camera follow | ✅ | ❌ | Pinch also stops the follow in the port; the HarmonyOS list counts only the drag, #61. |
| 63 | `Tab Bar > New Workout` Tap Re-Center to resume automatic map follow of the current location | ✅ | ✅ |  |
| 64 | `Tab Bar > New Workout` Tap the workout type button to open the Workout Type Alert | ✅ | ✅ |  |
| 65 | `Tab Bar > New Workout` Tap the readiness indicator while it reads WAITING to open the Waiting for GPS alert | ✅ | ✅ |  |
| 66 | `Tab Bar > New Workout` Tap Okay on the Waiting for GPS alert to dismiss it | ✅ | ✅ |  |
| 67 | `Tab Bar > New Workout` Tap Start to begin recording a workout | ✅ | ✅ |  |
| 68 | `Tab Bar > New Workout` Tap the Pause icon button while recording to pause the workout | ✅ | ✅ |  |
| 69 | `Tab Bar > New Workout` Tap the Play icon button while paused to resume recording the workout | ✅ | ✅ |  |
| 70 | `Tab Bar > New Workout` Tap Stop to stop recording and open the Completion Banner | ✅ | ✅ |  |
| 71 | `Tab Bar > New Workout` Tap Okay on the builder error alert to dismiss it | ✅ | ✅ |  |
| 72 | `Tab Bar > New Workout > Workout Type Alert` Tap Running to set the workout type to Running | ✅ | ❌ | Same alert in the port; the HarmonyOS list counts its options only from the Timeline, #38. |
| 73 | `Tab Bar > New Workout > Workout Type Alert` Tap Walking to set the workout type to Walking | ✅ | ❌ | Same alert in the port; the HarmonyOS list counts its options only from the Timeline, #39. |
| 74 | `Tab Bar > New Workout > Workout Type Alert` Tap Hiking to set the workout type to Hiking | ✅ | ❌ | Same alert in the port; the HarmonyOS list counts its options only from the Timeline, #40. |
| 75 | `Tab Bar > New Workout > Workout Type Alert` Tap Cycling to set the workout type to Cycling | ✅ | ❌ | Same alert in the port; the HarmonyOS list counts its options only from the Timeline, #41. |
| 76 | `Tab Bar > New Workout > Workout Type Alert` Tap Skating to set the workout type to Skating | ✅ | ❌ | Same alert in the port; the HarmonyOS list counts its options only from the Timeline, #42. |
| 77 | `Tab Bar > New Workout > Workout Type Alert` Tap Cancel to dismiss the Workout Type Alert and keep the current workout type | ✅ | ❌ | Same alert in the port; the HarmonyOS list counts its options only from the Timeline, #44. |
| 78 | `Tab Bar > New Workout > Close Recording Alert` Tap Stop recording to save the workout without the Completion Banner and close the New Workout screen | ✅ | ✅ |  |
| 79 | `Tab Bar > New Workout > Close Recording Alert` Tap Continue to dismiss the Close Recording Alert and keep recording | ✅ | ✅ | The button reads Cancel. |
| 80 | `Tab Bar > New Workout > Location Permission Alert` Tap Cancel to dismiss the Location Permission Alert | ✅ | ✅ | HarmonyOS shows a one-button error alert (Okay). |
| 81 | `Tab Bar > New Workout > Location Permission Alert` Tap Open to open this app's page in the iOS Settings app | ✅ | ❌ | HarmonyOS has no link to the app settings page; the alert has only Okay, #80. |
| 82 | `Tab Bar > New Workout > Completion Banner` Tap Save to save the recorded workout and show a save-result message banner | ✅ | ✅ |  |
| 83 | `Tab Bar > New Workout > Completion Banner` Tap Continue to resume recording the workout from the finished state | ✅ | ✅ |  |
| 84 | `Tab Bar > New Workout > Completion Banner` Tap Discard to drop the recorded workout without a confirmation dialog | ✅ | ✅ |  |
| 85 | `Workout List > Workout Detail` Tap the close icon in the header to close Workout Detail | ✅ | ✅ |  |
| 86 | `Workout List > Workout Detail` Tap the Share icon in the header to open the Share Alert (Export Your Workout) | ✅ | ✅ |  |
| 87 | `Workout List > Workout Detail` Tap the Route map thumbnail to open Workout Map | ✅ | ✅ |  |
| 88 | `Workout List > Workout Detail` Tap Add to Apple Health to save the workout to Apple Health | ✅ | ✅ | Huawei Health is not connected; the port only marks the workout in its own database. |
| 89 | `Workout List > Workout Detail` Tap Remove from Apple Health to remove the workout from Apple Health | ✅ | ✅ | Huawei Health is not connected; the port only marks the workout in its own database. |
| 90 | `Workout List > Workout Detail` Tap Edit to open Edit Workout for this workout | ✅ | ✅ |  |
| 91 | `Workout List > Workout Detail` Tap Delete to open the Delete Workout alert | ✅ | ✅ |  |
| 92 | `Workout List > Workout Detail` Tap Okay on the statistics loading error alert to dismiss it and close Workout Detail | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 93 | `Workout List > Workout Detail` Tap Okay on the Apple Health add error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 94 | `Workout List > Workout Detail` Tap Okay on the Apple Health remove error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 95 | `Workout List > Workout Detail > Delete Workout Alert` Tap Delete to delete a workout that has no Apple Health copy from the app and close Workout Detail | ✅ | ✅ |  |
| 96 | `Workout List > Workout Detail > Delete Workout Alert` Tap Delete to open the Delete in Apple Health alert for a workout that has an Apple Health copy | ✅ | ✅ |  |
| 97 | `Workout List > Workout Detail > Delete Workout Alert` Tap Cancel to dismiss the Delete Workout alert and keep the workout | ✅ | ✅ |  |
| 98 | `Workout List > Workout Detail > Delete Workout Alert` Tap Okay on the delete failure error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 99 | `Workout List > Workout Detail > Delete Workout Alert > Delete in Apple Health Alert` Tap Delete to delete the workout from Apple Health and then from the app | ✅ | ✅ |  |
| 100 | `Workout List > Workout Detail > Delete Workout Alert > Delete in Apple Health Alert` Tap the cancel-style button (caption renders as "NIL" in the Base/English build, source key Keep) to delete only the app copy and keep the Apple Health copy | ✅ | ✅ | The button reads Cancel. |
| 101 | `Workout List > Workout Detail > Delete Workout Alert > Delete in Apple Health Alert` Tap Okay on the Apple Health delete failure error alert to dismiss it and continue deleting the workout from the app | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 102 | `Workout List > Workout Detail > Share Alert` Tap OutRun Backup to export the workout as an OutRun backup file and open the iOS share sheet | ✅ | ✅ |  |
| 103 | `Workout List > Workout Detail > Share Alert` Tap GPX File to export the workout route as a GPX file and open the iOS share sheet | ✅ | ✅ |  |
| 104 | `Workout List > Workout Detail > Share Alert` Tap Cancel to dismiss the Share Alert | ✅ | ✅ |  |
| 105 | `Timeline > Workout Details > Workout Share Alert` Tap outside the sheet to dismiss the Workout Share Alert | ❌ | ✅ | The iOS list does not count a tap outside the alert. |
| 106 | `Workout List > Workout Detail > Share Alert` Tap Okay on the OutRun Backup export error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 107 | `Workout List > Workout Detail > Share Alert` Tap Okay on the GPX export error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 108 | `Workout List > Workout Detail > Share Alert > iOS Share Sheet` Tap an option in the iOS share sheet to share the exported workout file | ✅ | ❌ | The port opens the system Share panel (Share Kit); the HarmonyOS list does not count it. |
| 109 | `Workout List > Workout Detail > Workout Map` Tap the close icon in the header to close Workout Map | ✅ | ✅ |  |
| 110 | `Workout List > Workout Detail > Workout Map` Tap the map type button (initial caption "STANDARD") to open the Map Type alert | ✅ | ✅ |  |
| 111 | `Workout List > Workout Detail > Workout Map` Tap the Altitude segment to show the altitude chart for the workout | ✅ | ✅ |  |
| 112 | `Workout List > Workout Detail > Workout Map` Tap the Speed segment to show the speed chart for the workout | ✅ | ✅ |  |
| 113 | `Workout List > Workout Detail > Workout Map` Tap a data point on the chart to move a marker on the route map to that sample's position | ✅ | ✅ |  |
| 114 | `Workout List > Workout Detail > Workout Map` Drag the route map to pan the visible area | ✅ | ❌ | The port map takes pan too; the HarmonyOS list does not count map gestures. |
| 115 | `Workout List > Workout Detail > Workout Map` Pinch the route map to zoom in or out | ✅ | ❌ | The port map takes pinch too; the HarmonyOS list does not count map gestures. |
| 116 | `Workout List > Workout Detail > Workout Map` Tap the compass button on the route map | ✅ | ❌ | The port shows the Map Kit compass; the HarmonyOS list does not count it. |
| 117 | `Workout List > Workout Detail > Workout Map > Map Type Alert` Tap Standard to show the standard map | ✅ | ✅ |  |
| 118 | `Workout List > Workout Detail > Workout Map > Map Type Alert` Tap Hybrid to show the hybrid map | ✅ | ❌ | Petal Maps serves no satellite imagery in the target region; the port offers Terrain, #120. |
| 119 | `Workout List > Workout Detail > Workout Map > Map Type Alert` Tap Satellite to show the satellite map | ✅ | ❌ | Petal Maps serves no satellite imagery in the target region; the port offers Terrain, #120. |
| 120 | `Timeline > Workout Details > Workout Map > Map Type Alert` Tap Terrain to set the map type to Terrain | ❌ | ✅ | Replaces Hybrid and Satellite, #118 and #119. |
| 121 | `Workout List > Workout Detail > Workout Map > Map Type Alert` Tap Cancel to dismiss the Map Type alert and keep the current map type | ✅ | ✅ |  |
| 122 | `Workout List > Workout Detail > Edit Workout` Tap Cancel to close Edit Workout without saving | ✅ | ✅ | The HarmonyOS list splits Cancel by an existing or a new workout. |
| 123 | `Workout List > Workout Detail > Edit Workout` Tap Save to apply the changes to the workout and show its Workout Detail | ✅ | ✅ |  |
| 124 | `Workout List > Workout Detail > Edit Workout` Tap Save to add the entered values as a new manual workout and show its Workout Detail | ✅ | ✅ | The HarmonyOS list has one Save row for both cases, #123. |
| 125 | `Workout List > Workout Detail > Edit Workout` Tap the Type row to open the Type Picker | ✅ | ✅ | The port shows the type wheel inline. |
| 126 | `Workout List > Workout Detail > Edit Workout` Type a distance in the Distance field to set the workout distance in the preferred distance unit | ✅ | ✅ |  |
| 127 | `Workout List > Workout Detail > Edit Workout` Type a number in the Steps field (captioned "Pedal Strokes" for cycling, placeholder "Not Set") to set the step count | ✅ | ✅ |  |
| 128 | `Workout List > Workout Detail > Edit Workout` Tap the Start Date row to open the Start Date Picker | ✅ | ✅ | The port shows the date and time wheels inline. |
| 129 | `Workout List > Workout Detail > Edit Workout` Tap the Duration row to open the Duration Picker | ✅ | ✅ | The port shows the duration wheels inline. |
| 130 | `Workout List > Workout Detail > Edit Workout` Tap the Race switch to mark the workout as a race or not | ✅ | ✅ |  |
| 131 | `Workout List > Workout Detail > Edit Workout` Type text in the Comment field (placeholder "Comment") to set the workout comment | ✅ | ✅ |  |
| 132 | `Workout List > Workout Detail > Edit Workout` Tap Okay on the save failure error alert to dismiss it | ✅ | ✅ |  |
| 133 | `Workout List > Workout Detail > Edit Workout` Tap Okay on the Apple Health alter failure error alert to dismiss it and close Edit Workout | ✅ | ✅ |  |
| 134 | `Workout List > Workout Detail > Edit Workout` Tap Okay on the Apple Health save failure error alert to dismiss it and close Edit Workout | ✅ | ✅ |  |
| 135 | `Timeline > Edit Workout > Load Error Alert` Tap Okay to dismiss the Load Error Alert | ❌ | ✅ | The iOS list has no load error row for Edit Workout. |
| 136 | `Workout List > Workout Detail > Edit Workout > Type Picker` Swipe the picker wheel to select a workout type | ✅ | ✅ |  |
| 137 | `Workout List > Workout Detail > Edit Workout > Type Picker` Tap Done on the picker toolbar to close the Type Picker | ✅ | ✅ |  |
| 138 | `Workout List > Workout Detail > Edit Workout > Start Date Picker` Swipe the date and time wheels to set the workout Start Date | ✅ | ✅ | The HarmonyOS list has one row each for the date and the time wheel. |
| 139 | `Workout List > Workout Detail > Edit Workout > Start Date Picker` Tap Done on the picker toolbar to close the Start Date Picker | ✅ | ❌ | The port shows the wheels inline; the HarmonyOS list has no Done row for them. |
| 140 | `Workout List > Workout Detail > Edit Workout > Duration Picker` Swipe the hours, minutes and seconds wheels to set the workout Duration | ✅ | ✅ | The HarmonyOS list has one row each for hours, minutes and seconds. |
| 141 | `Workout List > Workout Detail > Edit Workout > Duration Picker` Tap Done on the picker toolbar to close the Duration Picker | ✅ | ❌ | The port shows the wheels inline; the HarmonyOS list has no Done row for them. |
| 142 | `Timeline > Edit Workout > Edit Workout Pauses` Tap the back button labelled New Workout to leave Edit Workout Pauses | ❌ | ✅ | iOS has this page but never opens it; the port reaches it only by the targetPage link, #248. |
| 143 | `Settings` Type text in the Name field to save the user name | ✅ | ✅ |  |
| 144 | `Settings` Type a number in the Weight field to save the user weight | ✅ | ✅ |  |
| 145 | `Settings` Tap Distance Unit to open the Distance Unit page | ✅ | ✅ | Opens a unit pick list. |
| 146 | `Settings` Tap Altitude Unit to open the Altitude Unit page | ✅ | ✅ | Opens a unit pick list. |
| 147 | `Settings` Tap Speed Unit to open the Speed Unit page | ✅ | ✅ | Opens a unit pick list. |
| 148 | `Settings` Tap Energy Unit to open the Energy Unit page | ✅ | ✅ | Opens a unit pick list. |
| 149 | `Settings` Tap Weight Unit to open the Weight Unit page | ✅ | ✅ | Opens a unit pick list. |
| 150 | `Settings` Tap Standard Type to open the Standard Type page | ✅ | ✅ |  |
| 151 | `Settings` Tap the Show Map switch to turn the map display on or off | ✅ | ✅ |  |
| 152 | `Settings` Tap GPS Accuracy to open the GPS Accuracy page | ✅ | ✅ |  |
| 153 | `Settings` Tap the Display Pace switch to show pace instead of speed or the reverse | ✅ | ✅ |  |
| 154 | `Settings` Tap the Display Rolling Speed switch to turn the rolling speed or pace display on or off | ✅ | ✅ |  |
| 155 | `Settings` Tap Terms of Service to open the Terms of Service page | ✅ | ❌ | The port's Settings has no Support section (Terms, Privacy, Email). Terms of Service is still in Setup, #4. |
| 156 | `Settings` Tap Privacy Policy to open the Privacy Policy page | ✅ | ❌ | The port's Settings has no Support section (Terms, Privacy, Email). Privacy Policy is still in Setup, #2. |
| 157 | `Settings` Tap Email to open a mailto link for outrun@tadris.de with the subject OutRun | ✅ | ❌ | The port's Settings has no Support section (Terms, Privacy, Email). |
| 158 | `Settings` Tap Contribution to open the Contribution page | ✅ | ✅ |  |
| 159 | `Settings` Tap View Source Code to open the link https://github.com/timfraedrich/OutRun | ✅ | ✅ |  |
| 160 | `Settings` Tap Okay on the no-mail-app error alert to dismiss it | ✅ | ❌ | The port's Settings has no Support section (Terms, Privacy, Email). |
| 161 | `Settings` Tap Okay on the source code link error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 162 | `Settings > Distance Unit` Tap Standard to use the default distance unit | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 163 | `Settings > Distance Unit` Tap Kilometers to set the distance unit to kilometers | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 164 | `Settings > Distance Unit` Tap Miles to set the distance unit to miles | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 165 | `Settings > Altitude Unit` Tap Standard to use the default altitude unit | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 166 | `Settings > Altitude Unit` Tap Meters to set the altitude unit to meters | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 167 | `Settings > Altitude Unit` Tap Feet to set the altitude unit to feet | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 168 | `Settings > Speed Unit` Tap Standard to use the default speed unit | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 169 | `Settings > Speed Unit` Tap km/h to set the speed unit to kilometers per hour | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 170 | `Settings > Speed Unit` Tap mph to set the speed unit to miles per hour | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 171 | `Settings > Energy Unit` Tap Standard to use the default energy unit | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 172 | `Settings > Energy Unit` Tap kJ to set the energy unit to kilojoules | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 173 | `Settings > Energy Unit` Tap kcal to set the energy unit to kilocalories | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 174 | `Settings > Weight Unit` Tap Standard to use the default weight unit | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 175 | `Settings > Weight Unit` Tap kg to set the weight unit to kilograms | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 176 | `Settings > Weight Unit` Tap lb to set the weight unit to pounds | ✅ | ❌ | The port has this option in the pick list, #145; the HarmonyOS list does not count the options. |
| 177 | `Settings > Standard Type` Tap Running to set the standard workout type to running | ✅ | ✅ | The HarmonyOS list has one row for all five types. |
| 178 | `Settings > Standard Type` Tap Walking to set the standard workout type to walking | ✅ | ✅ | Same row as #177. |
| 179 | `Settings > Standard Type` Tap Hiking to set the standard workout type to hiking | ✅ | ✅ | Same row as #177. |
| 180 | `Settings > Standard Type` Tap Cycling to set the standard workout type to cycling | ✅ | ✅ | Same row as #177. |
| 181 | `Settings > Standard Type` Tap Skating to set the standard workout type to skating | ✅ | ✅ | Same row as #177. |
| 182 | `Settings > Standard Type` Tap Back to return to the previous page | ❌ | ✅ | Back button on a pushed page; the iOS list does not count back buttons. |
| 183 | `Settings > GPS Accuracy` Tap Standard to use the default GPS accuracy | ✅ | ✅ |  |
| 184 | `Settings > GPS Accuracy` Tap High to set the GPS accuracy to 20 m | ✅ | ✅ |  |
| 185 | `Settings > GPS Accuracy` Tap Acceptable to set the GPS accuracy to 30 m | ✅ | ✅ |  |
| 186 | `Settings > GPS Accuracy` Tap Last Resort to set the GPS accuracy to 50 m | ✅ | ✅ |  |
| 187 | `Settings > GPS Accuracy` Tap Off (not recommended) to turn the GPS accuracy filter off | ✅ | ✅ |  |
| 188 | `Settings > GPS Accuracy` Tap Back to return to the previous page | ❌ | ✅ | Back button on a pushed page; the iOS list does not count back buttons. |
| 189 | `Settings > Contribution` Tap a contributor name to open that contributor's link | ✅ | ✅ |  |
| 190 | `Settings > Contribution` Tap Back to return to the previous page | ❌ | ✅ | Back button on a pushed page; the iOS list does not count back buttons. |
| 191 | `Settings > Terms of Service` Tap Close to dismiss the Terms of Service page | ✅ | ❌ | The port's Settings has no Support section (Terms, Privacy, Email). |
| 192 | `Settings > Privacy Policy` Tap Close to dismiss the Privacy Policy page | ✅ | ❌ | The port's Settings has no Support section (Terms, Privacy, Email). |
| 193 | `Tab Bar` Tap the tab bar 10 times in a row while the Settings tab is selected to open the Debug screen | ✅ | ✅ |  |
| 194 | `Tab Bar > Debug` Tap Close to dismiss the Debug page | ✅ | ✅ |  |
| 195 | `Tab Bar > Debug` Tap Clear Cache to clear the map image cache | ✅ | ✅ |  |
| 196 | `Tab Bar > Debug` Tap Okay on the cache result info alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 197 | `Settings` Tap the Sync Workouts switch to turn workout synchronisation with Apple Health on or off | ✅ | ✅ | Huawei Health in the port. |
| 198 | `Settings` Tap the Sync Weight switch to turn weight synchronisation with Apple Health on or off | ✅ | ✅ | Huawei Health in the port. |
| 199 | `Settings` Tap the Auto Import Workouts switch to turn automatic import of new Apple Health workouts on or off | ✅ | ✅ | Huawei Health in the port. |
| 200 | `Settings` Tap Import from Apple Health to open the Apple Health Import page | ✅ | ✅ | Opens the Import List for Huawei Health. |
| 201 | `Settings` Tap Sync All Unsynced Workouts to sync every unsynced workout with Apple Health | ✅ | ✅ | Huawei Health is not connected; the port only marks the workout in its own database. |
| 202 | `Settings` Tap Okay on the already-synced info alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 203 | `Settings` Tap Okay on the sync success info alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 204 | `Settings` Tap Okay on the sync error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 205 | `Settings > Apple Health Authorization Prompt` Tap a response option on the system Apple Health authorization sheet to grant or deny access | ✅ | ❌ | The HarmonyOS list has no system authorization sheet row; Setup requests it, #20. |
| 206 | `Settings > Import List` Tap the Settings back button to return to the Settings page | ❌ | ✅ | Back button on a pushed page; the iOS list does not count back buttons. |
| 207 | `Settings > Apple Health Import` Tap Import All to open the Import all Workouts? alert | ✅ | ✅ |  |
| 208 | `Settings > Apple Health Import` Tap an Apple Health workout row to open the Import this Workout? alert | ✅ | ✅ |  |
| 209 | `Settings > Apple Health Import` Tap Okay in the fetch error alert to dismiss the Apple Health Import page | ✅ | ✅ |  |
| 210 | `Settings > Apple Health Import` Tap Okay on the single workout import error alert to dismiss it | ✅ | ✅ |  |
| 211 | `Settings > Apple Health Import` Tap Okay in the import error alert to reload the Apple Health workout list | ✅ | ✅ | HarmonyOS dismisses the alert; the list does not say it reloads. |
| 212 | `Settings > Apple Health Import > Import This Workout Alert` Tap Yes to import the selected Apple Health workout into OutRun | ✅ | ✅ |  |
| 213 | `Settings > Apple Health Import > Import This Workout Alert` Tap No to dismiss the alert without importing | ✅ | ✅ | The button reads Cancel. |
| 214 | `Settings > Apple Health Import > Import All Alert` Tap Yes to import all listed Apple Health workouts into OutRun | ✅ | ✅ |  |
| 215 | `Settings > Apple Health Import > Import All Alert` Tap No to dismiss the alert without importing | ✅ | ✅ | The button reads Cancel. |
| 216 | `Settings` Tap Create Backup to export all workouts as an .orbup file and open the share sheet | ✅ | ✅ |  |
| 217 | `Settings > Backup Share Sheet` Tap a share target in the iOS share sheet to send the .orbup backup file | ✅ | ❌ | The port opens the system Share panel (Share Kit); the HarmonyOS list does not count it. |
| 218 | `Settings` Tap Okay on the backup failure error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 219 | `Settings` Tap Import Backup Data to open the document picker for .orbup backup files | ✅ | ✅ |  |
| 220 | `Settings > Import Backup Picker` Tap an .orbup file in the document picker to import its unique workouts | ✅ | ✅ | Same row as #219; the HarmonyOS list counts picking and importing as one. |
| 221 | `Settings > Import Backup Picker` Tap Cancel in the document picker to close it without importing | ✅ | ❌ | The port uses the system file picker; the HarmonyOS list does not count its Cancel. |
| 222 | `Settings` Tap Okay on the backup import success alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 223 | `Settings` Tap Okay on the backup import error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 224 | `Settings` Tap Delete all data to open the delete confirmation alert | ✅ | ✅ |  |
| 225 | `Settings > Delete All Data Alert` Tap Delete to continue to the Apple Health data alert | ✅ | ✅ |  |
| 226 | `Settings > Delete All Data Alert` Tap Cancel to dismiss the alert without deleting anything | ✅ | ✅ |  |
| 227 | `Settings > Delete All Data Alert > Delete Apple Health Data Alert` Tap Delete to erase all app data and the Apple Health workouts, then return to the Start Screen | ✅ | ✅ | Huawei Health in the port. |
| 228 | `Settings > Delete All Data Alert > Delete Apple Health Data Alert` Tap Keep to erase all app data but keep the Apple Health workouts, then return to the Start Screen | ✅ | ✅ | The button reads Cancel. |
| 229 | `Settings` Tap Okay on the local data delete error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 230 | `Settings` Tap Okay on the Apple Health delete error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 231 | `Global` Launch the app to open the Tab Bar when setup is complete, or the Start Screen on first run | ✅ | ❌ | The port does the same at launch; the HarmonyOS list does not count it. |
| 232 | `Global` Launch the app after setup to check location, motion and Apple Health permissions and show an alert for each one that is not granted | ✅ | ❌ | The port runs no permission check at launch. |
| 233 | `Global` Tap Okay on the launch-time Apple Health permission alert to dismiss it | ✅ | ❌ | The port runs no permission check at launch. |
| 234 | `Global > Launch Permission Alert` Tap Cancel to dismiss the launch-time location or motion permission alert | ✅ | ❌ | The port runs no permission check at launch. |
| 235 | `Global > Launch Permission Alert` Tap Open to open the iOS Settings app from the launch-time location or motion permission alert | ✅ | ❌ | The port runs no permission check at launch. |
| 236 | `Global` Launch the app after a version update to show the Changelog for the new version when one exists | ✅ | ✅ |  |
| 237 | `Tab Bar > Changelog` Tap the Close (X) icon to dismiss the Changelog | ✅ | ✅ |  |
| 238 | `Tab Bar > Changelog` Tap the dimmed background outside the changelog card to dismiss the Changelog | ✅ | ✅ |  |
| 239 | `Global` Relaunch the app after it was closed during a recording to show the Rescued Workout Alert | ✅ | ❌ | The port shows this alert too; the HarmonyOS list counts only its buttons, #240. |
| 240 | `Global > Rescued Workout Alert` Tap Save to save the rescued workout and show it | ✅ | ✅ |  |
| 241 | `Global > Rescued Workout Alert` Tap Cancel to dismiss the Rescued Workout Alert without saving | ✅ | ✅ |  |
| 242 | `Global` Tap Okay on the rescued workout save error alert to dismiss it | ✅ | ❌ | The port has this alert; the HarmonyOS list does not count it. |
| 243 | `Global` Relaunch the app after a recording could not be saved on termination to show the Lost Workout Alert | ✅ | ❌ | The port shows this alert too; the HarmonyOS list counts only its button, #244. |
| 244 | `Global > Lost Workout Alert` Tap Okay to dismiss the Lost Workout Alert | ✅ | ✅ |  |
| 245 | `Global` Send the app to the background and bring it back to suspend and resume the rendering of workout map images | ✅ | ❌ | The port does the same on background and foreground; the HarmonyOS list does not count it. |
| 246 | `Global` Tap Done on the keyboard toolbar to end editing of the focused text field | ✅ | ✅ | The HarmonyOS list counts it on Edit Workout. |
| 247 | `Global` Tap the X on a banner to dismiss it | ✅ | ✅ |  |
| 248 | `Global` Launch the app with a targetPage deep link to open a registered page directly, including the Progress page | ❌ | ✅ | Launch parameter for testing; iOS has no counterpart. |
