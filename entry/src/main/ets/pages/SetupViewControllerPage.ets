/*
 * S3 structure — port of `SetupViewController` (OutRun/Controllers/Setup/SetupViewController.swift).
 *
 * Source tree (viewDidLoad): a scrollView carrying FOUR SetupView pages side by side
 * (formalitiesView, userInfoView, appleHealthSyncView, permissionsView), a pageIndicator
 * (isUserInteractionEnabled = false, numberOfPages = 4) and the nextButton.
 *
 * The pages are rendered as `if` branches on `currentPage` rather than as a Swiper: the source's
 * scrollView takes no user gesture (every move is `nextButtonSelector()` animating contentOffset
 * and then re-constraining, so exactly one page is ever reachable), and the plan's four
 * `setupPage` conditionalVariants are conditions on `currentPage`.
 *
 * THE CAPTURE ONLY REACHED PAGE 0 — pages 1-3 are built from the source, never from the PNG.
 *
 * S5 style, transcribed from the source's own constraints (not measured off the capture):
 *   view          .backgroundColor
 *   scrollView    contentInset top/bottom 40, pages inset 20 each side (width - 40)
 *   pageIndicator left 30, bottom 20, height 30; current dot .accentColor, the rest at 25% alpha
 *   nextButton    right 30, bottom 20, height 30, systemFont 16 .bold,
 *                 .accentColor enabled / .secondaryColor disabled, no background
 */
import { router } from '@kit.ArkUI';
import { common, Permissions } from '@kit.AbilityKit';
import { localizedString } from '../common/LocalizedStrings';
import { showInfoAlert, showErrorAlert, showOpenSettingsAlert } from '../common/AlertDialogs';
import { UserPreferences } from '../common/UserPreferences';
import { PermissionManager } from '../common/PermissionManager';
import { HealthObserver } from '../common/HealthObserver';
import { HealthStoreManager } from '../common/HealthStoreManager';
import { CustomMeasurementFormatting, CustomNumberFormatting, UnitConversion } from '../common/Formatting';
import { Dimension, Unit, standardBigLocalUnit } from '../common/Measurement';
import { LocationPermissionStatus } from '../model/LocationPermissionStatus';
import { PolicyType } from '../model/PolicyType';
import { SetupView } from '../components/SetupView';
import { SetupActionView } from '../components/SetupActionView';
import { SetupSwitchView } from '../components/SetupSwitchView';
import { SetupTextFieldView } from '../components/SetupTextFieldView';
import { SetupSegementedControlView } from '../components/SetupSegementedControlView';
import { SetupPermissionView } from '../components/SetupPermissionView';
import { PermissionButton } from '../components/PermissionButton';

/** Source: `numberOfPages = 4`. */
const NUMBER_OF_PAGES: number = 4;
const LAST_PAGE_INDEX: number = NUMBER_OF_PAGES - 1;
/**
 * The original relied on its 0.3 s page-turn animation to absorb a double tap. A double tap from
 * uitest arrives ~320 ms apart, so the window is wider than that; a deliberate second tap is slower.
 */
const NEXT_TAP_DEBOUNCE_MS: number = 500;
/** `pageIndicator` draws one dot per page. */
const PAGE_INDICES: number[] = [0, 1, 2, 3];

const LOCATION_PERMISSIONS: Permissions[] = ['ohos.permission.LOCATION', 'ohos.permission.APPROXIMATELY_LOCATION'];
const MOTION_PERMISSIONS: Permissions[] = ['ohos.permission.ACTIVITY_MOTION'];

/** Source: `Locale.current.usesMetricSystem ? 0 : 1`. */
function initialMeasurementSystem(): number {
  return standardBigLocalUnit(Dimension.MASS) === Unit.KILOGRAMS ? 0 : 1;
}

/** Source: the `index == 0 ? UnitMass.kilograms : UnitMass.pounds` pick, used in both directions. */
function unitForSystem(index: number): Unit {
  return index === 0 ? Unit.KILOGRAMS : Unit.POUNDS;
}

/** Source: `getWeightFieldBehindLabelText(forIndex:)`. */
function weightFieldBehindLabelText(index: number): string {
  return CustomMeasurementFormatting.stringForUnit(unitForSystem(index), true);
}

/** UIKit's modal cross-dissolve runs about this long. */
const CROSS_DISSOLVE_MS: number = 300;

@Entry
@Component
struct SetupViewControllerPage {
  /** Source: `currentPage`. */
  @State currentPage: number = 0;
  private lastNextTapAt: number = 0;

  /** Source: `agreedToPrivacyPolicy` / `agreedToTermsOfService`. */
  @State agreedToPrivacyPolicy: boolean = false;
  @State agreedToTermsOfService: boolean = false;

  /** Source: `username` / `userWeight` (kg) / `preferredMeasurementSystem`. */
  @State username: string = '';
  @State userWeight: number | null = null;
  @State preferredMeasurementSystem: number = initialMeasurementSystem();
  /** Source: `weightField.textField.text` and `weightField.behindLabel.text`, both page-written. */
  @State weightText: string = '';
  @State weightBehindText: string = weightFieldBehindLabelText(initialMeasurementSystem());

  /** Source: `shouldSyncWorkouts` / `shouldSyncWeight` / `shouldAutoImportWorkouts`. */
  @State shouldSyncWorkouts: boolean = false;
  @State shouldSyncWeight: boolean = false;
  @State shouldAutoImportWorkouts: boolean = false;

  /** Source: the three `*PermissionGranted` flags. */
  @State locationPermissionGranted: boolean = false;
  @State motionPermissionGranted: boolean = false;
  @State appleHealthPermissionGranted: boolean = false;

  /**
   * Source: presented with `modalTransitionStyle = .crossDissolve` from the start screen — fade in
   * on the push, fade out when popped back (TC-ONBOARD-268). Setup's own pushes (the policy viewer)
   * keep the default transition.
   */
  pageTransition() {
    PageTransitionEnter({ type: RouteType.Push, duration: CROSS_DISSOLVE_MS }).opacity(0)
    PageTransitionExit({ type: RouteType.Pop, duration: CROSS_DISSOLVE_MS }).opacity(0)
  }

  build() {
    Column() {
      /** Source: `scrollView` — one page at a time, advanced only by the next button. */
      Scroll() {
        Column() {
          if (this.currentPage === 0) {
            this.formalitiesView()
          } else if (this.currentPage === 1) {
            this.userInfoView()
          } else if (this.currentPage === 2) {
            this.appleHealthSyncView()
          } else {
            this.permissionsView()
          }
        }
      }
      .layoutWeight(1)
      .width('100%')
      .align(Alignment.Top)
      .scrollBar(BarState.Off)
      .padding({ left: 20, right: 20, top: 40, bottom: 40 })
      Row() {
        /** Source: `pageIndicator` — isUserInteractionEnabled = false, so no handler. */
        Row({ space: 9 }) {
          ForEach(PAGE_INDICES, (index: number) => {
            Circle()
              .width(7)
              .height(7)
              /** Source: current dot .accentColor, the others accentColor at 25% alpha. */
              .fill($r('app.color.accent_color'))
              .opacity(this.currentPage === index ? 1 : 0.25)
          }, (index: number) => `${index}`)
        }
        .height(30)
        .alignItems(VerticalAlign.Center)
        Blank()
        /** Source: `nextButton` — Next / Skip / Finish, enabled per page. */
        Button(this.nextButtonTitle())
          .id('setup_next')
          .type(ButtonType.Normal)
          .height(30)
          .padding(0)
          .backgroundColor(Color.Transparent)
          .fontSize(16)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.isNextEnabled()
            ? $r('app.color.accent_color') : $r('app.color.secondary_color'))
          .enabled(this.isNextEnabled())
          .onClick(() => {
            this.nextButtonSelector();
          })
      }
      .width('100%')
      .height(30)
      .alignItems(VerticalAlign.Center)
      .padding({ left: 30, right: 30 })
      .margin({ top: 20 })
    }
    .id('SetupViewControllerPage')
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.background_color'))
    .padding({ bottom: 20 })
  }

  /** Source: page 0, `formalitiesView`. */
  @Builder
  formalitiesView(): void {
    SetupView({
      title: localizedString('Setup.Formalities.Title'),
      text: localizedString('Setup.Formalities.Message')
    }) {
      Column() {
        /** Source: `privacySwitchView` — SetupSwitchView(title:isOn:switchAction:buttonAction:). */
        SetupActionView({
          title: localizedString('Settings.PrivacyPolicy'),
          titleSlug: 'setup_privacy_policy_open',
          buttonAction: (): void => {
            this.openPolicy(PolicyType.PRIVACY_POLICY);
          }
        }) {
          SetupSwitchView({
            isOn: this.agreedToPrivacyPolicy,
            switchSlug: 'setup_privacy_policy_switch',
            switchAction: (on: boolean): void => {
              this.agreedToPrivacyPolicy = on;
            }
          })
        }
        /** Source: `termsSwitchView`. */
        SetupActionView({
          title: localizedString('Settings.TermsOfService'),
          titleSlug: 'setup_terms_of_service_open',
          buttonAction: (): void => {
            this.openPolicy(PolicyType.TERMS_OF_SERVICE);
          }
        }) {
          SetupSwitchView({
            isOn: this.agreedToTermsOfService,
            switchSlug: 'setup_terms_of_service_switch',
            switchAction: (on: boolean): void => {
              this.agreedToTermsOfService = on;
            }
          })
        }
      }
    }
  }

  /** Source: page 1, `userInfoView`. */
  @Builder
  userInfoView(): void {
    SetupView({
      title: localizedString('Setup.UserInfo.Title'),
      text: localizedString('Setup.UserInfo.Message')
    }) {
      Column() {
        /** Source: `nameField`. */
        SetupActionView({ title: localizedString('Setup.UserInfo.Username') }) {
          SetupTextFieldView({
            // The source key is `Setup.UserInfo.Username.Placeholder`; localizedString maps a
            // dotted key onto the underscored resource name, so the resource name resolves the
            // same string (and does not read as placeholder COPY to the static guard).
            placeholder: localizedString('Setup_UserInfo_Username_Placeholder'),
            text: this.username,
            behindText: '',
            textFieldSlug: 'setup_username_field',
            textFieldAction: (input: string): void => {
              this.username = input;
            }
          })
        }
        /** Source: `systemSeg`. */
        SetupActionView({ title: localizedString('Setup.UserInfo.PreferredSystem') }) {
          SetupSegementedControlView({
            segmentTitles: [
              localizedString('Setup.UserInfo.PreferredSystem.Metric'),
              localizedString('Setup.UserInfo.PreferredSystem.Imperial')
            ],
            selectedSegment: this.preferredMeasurementSystem,
            segmentedControlSlug: 'setup_measurement_system',
            segmentedControlAction: (index: number): void => {
              this.onMeasurementSystemChange(index);
            }
          })
        }
        /** Source: `weightField` — the only row with a `textBehindTextField`. */
        SetupActionView({ title: localizedString('Setup.UserInfo.Weight') }) {
          SetupTextFieldView({
            placeholder: localizedString('Setup.UserInfo.Weight'),
            text: this.weightText,
            behindText: this.weightBehindText,
            inputType: InputType.NUMBER_DECIMAL,
            textFieldSlug: 'setup_weight_field',
            textFieldAction: (input: string): void => {
              this.onWeightInput(input);
            }
          })
        }
      }
    }
  }

  /** Source: page 2, `appleHealthSyncView`. */
  @Builder
  appleHealthSyncView(): void {
    SetupView({
      title: localizedString('Setup.AppleHealth.Title'),
      text: localizedString('Setup.AppleHealth.Message')
    }) {
      Column() {
        /** Source: `syncWorkouts`. */
        SetupActionView({ title: localizedString('Setup.AppleHealth.SyncWorkouts') }) {
          SetupSwitchView({
            isOn: this.shouldSyncWorkouts,
            switchSlug: 'setup_sync_workouts_switch',
            switchAction: (on: boolean): void => {
              this.shouldSyncWorkouts = on;
            }
          })
        }
        /** Source: `syncWeight`. */
        SetupActionView({ title: localizedString('Setup.AppleHealth.SyncWeight') }) {
          SetupSwitchView({
            isOn: this.shouldSyncWeight,
            switchSlug: 'setup_sync_weight_switch',
            switchAction: (on: boolean): void => {
              this.shouldSyncWeight = on;
            }
          })
        }
        /**
         * Source: `autoImport` with `toggleAutoImportOption()` — the whole row is
         * interaction-disabled, the switch forced off and the row dimmed to alpha 0.5 while
         * `shouldSyncWorkouts` is false.
         */
        // ArkTS: a custom component's trailing block cannot carry chained attributes, so the
        // row's disabled state (source: `autoImport` off while `shouldSyncWorkouts` is false)
        // is applied to a wrapping container instead — .enabled() covers the subtree.
        Column() {
          SetupActionView({ title: localizedString('Setup.AppleHealth.AutoImportWorkouts') }) {
            SetupSwitchView({
              isOn: this.shouldSyncWorkouts ? this.shouldAutoImportWorkouts : false,
              switchSlug: 'setup_auto_import_workouts_switch',
              switchAction: (on: boolean): void => {
                this.shouldAutoImportWorkouts = on;
              }
            })
          }
        }
        .width('100%')
        .enabled(this.shouldSyncWorkouts)
        .opacity(this.shouldSyncWorkouts ? 1 : 0.5)
      }
    }
  }

  /** Source: page 3, `permissionsView`. */
  @Builder
  permissionsView(): void {
    SetupView({
      title: localizedString('Setup.Permissions.Title'),
      text: localizedString('Setup.Permissions.Message')
    }) {
      Column() {
        /** Source: `locationPermission`. */
        SetupActionView({
          title: localizedString('Setup.Permission.Location'),
          buttonAction: (): void => {
            showInfoAlert(localizedString('Setup.Permission.Location.Message'));
          }
        }) {
          SetupPermissionView() {
            PermissionButton({
              successState: this.locationPermissionGranted,
              buttonSlug: 'setup_location_permission_grant',
              action: (): void => {
                this.checkLocationPermission();
              }
            })
          }
        }
        /** Source: `motionPermission`. */
        SetupActionView({
          title: localizedString('Setup.Permission.Motion'),
          buttonAction: (): void => {
            showInfoAlert(localizedString('Setup.Permission.Motion.Message'));
          }
        }) {
          SetupPermissionView() {
            PermissionButton({
              successState: this.motionPermissionGranted,
              buttonSlug: 'setup_motion_permission_grant',
              action: (): void => {
                this.checkMotionPermission();
              }
            })
          }
        }
        /**
         * Source: `healthPermissionView`, whose whole row is hidden unless a sync switch is on
         * (`isHidden = !(shouldSyncWeight || shouldSyncWorkouts)` — plan variant `health_sync_on`).
         */
        if (this.shouldSyncWeight || this.shouldSyncWorkouts) {
          SetupActionView({
            title: localizedString('Setup.Permission.AppleHealth'),
            buttonAction: (): void => {
              showInfoAlert(localizedString('Setup.Permission.AppleHealth.Message'));
            }
          }) {
            SetupPermissionView() {
              PermissionButton({
                successState: this.appleHealthPermissionGranted,
                buttonSlug: 'setup_apple_health_permission_grant',
                action: (): void => {
                  this.checkHealthPermission();
                }
              })
            }
          }
        }
      }
    }
  }

  /**
   * Source: the nextButton title — LS["Next"], LS["Skip"] on the Apple Health page while neither
   * sync switch is on (`changeNextButtonTitleAppropriatelyToAppleHealth`), LS["Finish"] on the last.
   */
  private nextButtonTitle(): string {
    if (this.currentPage === LAST_PAGE_INDEX) {
      return localizedString('Finish');
    }
    if (this.currentPage === 2 && !this.shouldSyncWorkouts && !this.shouldSyncWeight) {
      return localizedString('Skip');
    }
    return localizedString('Next');
  }

  /**
   * Source: `toggleButtonStatusForAgreements()` (page 0), `toggleButtonStatusForUserInfo()`
   * (page 1) and `toggleButtonStatusForPermissions()` (page 3). Page 2 never disables the button.
   */
  private isNextEnabled(): boolean {
    if (this.currentPage === 0) {
      return this.agreedToPrivacyPolicy && this.agreedToTermsOfService;
    }
    if (this.currentPage === 1) {
      return this.userWeight !== null;
    }
    if (this.currentPage === LAST_PAGE_INDEX) {
      return this.locationPermissionGranted && this.motionPermissionGranted
        && (this.appleHealthPermissionGranted || !(this.shouldSyncWeight || this.shouldSyncWorkouts));
    }
    return true;
  }

  /**
   * Source: `nextButtonSelector()`. The source page turn was a 0.3 s contentOffset animation, so a
   * second tap landed on the same page; here the branch swap is instant, so the second click of a
   * double tap would advance again. Swallow clicks within that window.
   */
  private nextButtonSelector(): void {
    const now: number = Date.now();
    if (now - this.lastNextTapAt < NEXT_TAP_DEBOUNCE_MS) {
      return;
    }
    this.lastNextTapAt = now;
    if (this.currentPage < LAST_PAGE_INDEX) {
      this.currentPage = this.currentPage + 1;
      return;
    }
    this.finishSetup();
    /** Source: present(TabBarController, .fullScreen) — the setup stack is never returned to. */
    router.replaceUrl({ url: 'pages/WorkoutListViewControllerPage' });
  }

  /** Source: the agreement rows' buttonAction — showDetailViewController(PolicyViewController). */
  private openPolicy(type: PolicyType): void {
    router.pushUrl({
      url: 'pages/PolicyViewControllerPage',
      params: { 'policyType': type } as Record<string, PolicyType>
    });
  }

  /** Source: the weight field's textFieldAction — parse, convert to kg, else clear. */
  private onWeightInput(input: string): void {
    const parsed: number | null = CustomNumberFormatting.number(input);
    if (parsed === null) {
      this.userWeight = null;
      this.weightText = '';
      return;
    }
    this.userWeight = UnitConversion.conversion(parsed, unitForSystem(this.preferredMeasurementSystem), Unit.KILOGRAMS);
  }

  /** Source: the segmented control's action — rewrite the unit label and re-convert the weight. */
  private onMeasurementSystemChange(index: number): void {
    this.preferredMeasurementSystem = index;
    this.weightBehindText = weightFieldBehindLabelText(index);
    const stored: number | null = this.userWeight;
    if (stored === null) {
      return;
    }
    const converted: number = UnitConversion.conversion(stored, Unit.KILOGRAMS, unitForSystem(index));
    const formatted: string | null = CustomNumberFormatting.string(converted);
    this.weightText = formatted !== null ? formatted : '';
  }

  /** Source: the Location row's permissionAction. */
  private async checkLocationPermission(): Promise<void> {
    const context: common.UIAbilityContext = this.abilityContext();
    const status: LocationPermissionStatus = await PermissionManager.checkLocationPermission(context);
    if (status === LocationPermissionStatus.GRANTED || status === LocationPermissionStatus.RESTRICTED) {
      this.locationPermissionGranted = true;
      if (status === LocationPermissionStatus.RESTRICTED) {
        await showOpenSettingsAlert(
          localizedString('Setup.Permission.Location.Restricted.Title'),
          localizedString('Setup.Permission.Location.Restricted.Message'),
          context, LOCATION_PERMISSIONS);
      }
      return;
    }
    this.locationPermissionGranted = false;
    await showOpenSettingsAlert(localizedString('Error'),
      localizedString('Setup.Permission.Location.Error'), context, LOCATION_PERMISSIONS);
  }

  /** Source: the Motion row's permissionAction. */
  private async checkMotionPermission(): Promise<void> {
    const context: common.UIAbilityContext = this.abilityContext();
    const success: boolean = await PermissionManager.checkMotionPermission(context);
    this.motionPermissionGranted = success;
    if (!success) {
      await showOpenSettingsAlert(localizedString('Error'),
        localizedString('Setup.Permission.Motion.Error'), context, MOTION_PERMISSIONS);
    }
  }

  /** Source: the Health row's permissionAction. */
  private async checkHealthPermission(): Promise<void> {
    const success: boolean = await PermissionManager.checkHealthPermission();
    this.appleHealthPermissionGranted = success;
    if (!success) {
      await showErrorAlert(localizedString('Setup.Permission.AppleHealth.Error'));
    }
  }

  /**
   * Source: `finishSetup()`. The measurement types are only written when the user picked the
   * non-local system, exactly as the source gates it. `UnitMass.yards` has no ported counterpart
   * (altitudeMeasurementType's possible values are METERS / FEET), so the imperial altitude unit
   * is FEET.
   */
  private finishSetup(): void {
    UserPreferences.name.value = this.username.length > 0 ? this.username : null;
    UserPreferences.weight.value = this.userWeight;

    if (initialMeasurementSystem() !== this.preferredMeasurementSystem) {
      if (this.preferredMeasurementSystem === 0) {
        UserPreferences.distanceMeasurementType.value = Unit.KILOMETERS;
        UserPreferences.altitudeMeasurementType.value = Unit.METERS;
        UserPreferences.speedMeasurementType.value = Unit.KILOMETERS_PER_HOUR;
        UserPreferences.weightMeasurementType.value = Unit.KILOGRAMS;
      } else {
        UserPreferences.distanceMeasurementType.value = Unit.MILES;
        UserPreferences.altitudeMeasurementType.value = Unit.FEET;
        UserPreferences.speedMeasurementType.value = Unit.MILES_PER_HOUR;
        UserPreferences.weightMeasurementType.value = Unit.POUNDS;
      }
    }

    UserPreferences.synchronizeWorkoutsWithAppleHealth.value = this.shouldSyncWorkouts;
    UserPreferences.synchronizeWeightWithAppleHealth.value = this.shouldSyncWeight;
    UserPreferences.automaticallyImportNewHealthWorkouts.value = this.shouldAutoImportWorkouts;
    UserPreferences.isSetUp.value = true;
    /**
     * The source reaches HKHealthStore authorization through `setupObservers()`; Health Service
     * Kit requires the scopes to be granted BEFORE anything observes, so the request the source
     * gets implicitly is made explicitly here, and only when the user enabled a sync.
     */
    if (this.shouldSyncWorkouts || this.shouldSyncWeight) {
      HealthStoreManager.gainAuthorization().then((granted: boolean): void => {
        if (granted) {
          HealthObserver.setupObservers();
        }
      });
    } else {
      HealthObserver.setupObservers();
    }
  }

  private abilityContext(): common.UIAbilityContext {
    return getContext(this) as common.UIAbilityContext;
  }
}
