/*
 * S3 structure — port of `WorkoutMapViewController`
 * (OutRun/Controllers/Workout/WorkoutMapViewController.swift:24-211) over its superclasses
 * `MapViewControllerWithContainerView` (the full-screen map plus the bottom container card) and
 * `DetailViewController` (the headline + close button).
 *
 * Source tree:
 *   mapView            the full-screen map; `WorkoutMapViewManager.setupRoute(forWorkout:mapView:
 *                      customEdgePadding: (100, 20, 50, 20))` draws the route polyline and fits the
 *                      camera to it
 *   compass            MKCompassButton, `compassVisibility = .adaptive`, above the container, right
 *   mapTypeButton      a FloatingButton titled LS["Standard"].uppercased(), above the container,
 *                      left; its tap presents Standard / Terrain / Cancel and the chosen
 *                      title becomes the button's own (so the label is DATA-BOUND, never a literal)
 *   headline           LS["WorkoutMapController.Headline"] + the close button
 *   containerView      segementedControl (Altitude | Speed, 30pt) over diagramView
 *                      (LabelledDiagramView with selection ENABLED — this screen IS its delegate)
 *
 * `viewDidLoad` dismisses itself when `workout == nil`, and `displayDiagramData(sender:)` drives the
 * diagram off the segmented control: segment 0 = `stats.queryAltitudes` titled
 * LS["WorkoutStats.Altitude"] with the altitude unit, segment 1 = `stats.querySpeeds` titled
 * LS["WorkoutStats.Speed"] with the speed unit, both through
 * `convertedForChartView(includeSamples: true, yUnit:)`.
 *
 * Map Kit per pipeline/reference/harmonyos-features.md ▸ Map Kit; the manifest's permission set is
 * already final and is not touched here. DIVERGENCE (owner decision 2026-10-05): iOS offers
 * `.hybrid` and `.satellite`; Map Kit has `MapType.HYBRID`/`SATELLITE`, but Petal Maps serves no
 * satellite imagery in the target region (its own app offers only Default and Terrain), so those
 * types showed a blank map (TC-MAP-064..074). The chooser offers Petal Maps' `TERRAIN` instead.
 */
import { drawing, common2D } from '@kit.ArkGraphics2D';
import { router } from '@kit.ArkUI';
import { relationalStore } from '@kit.ArkData';
import { MapComponent, map, mapCommon } from '@kit.MapKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { Workout } from '../model/Workout';
import { WorkoutSeriesDataSample } from '../model/WorkoutStatsSeriesSection';
import { TempWorkoutRouteDataSample } from '../model/TempWorkoutRouteDataSample';
import { CachedStatsSeries, WorkoutStats } from '../model/WorkoutStats';
import { LineChartData } from '../common/ChartData';
import { DataManager, TABLE_WORKOUT } from '../common/DataManager';
import { WorkoutStatsService } from '../common/WorkoutStatsService';
import { WorkoutMapViewManager } from '../common/WorkoutMapViewManager';
import { UserPreferences } from '../common/UserPreferences';
import { localizedString } from '../common/LocalizedStrings';
import { closeTo } from '../common/NavBack';
import { FloatingButton } from '../components/FloatingButton';
import { LabelledDiagramView } from '../components/LabelledDiagramView';

/** Source: `customEdgePadding: UIEdgeInsets(top: 100, left: 20, bottom: 50, right: 20)`. */
const ROUTE_EDGE_PADDING: mapCommon.Padding = { top: 100, left: 20, bottom: 50, right: 20 };
/** Source: `segementedControl.selectedSegmentIndex` — 0 altitude, 1 speed. */
const SEGMENT_ALTITUDE: number = 0;
const SEGMENT_SPEED: number = 1;
/** Source: `let spacing = 20` — the container card's inset for the control and the diagram. */
const CARD_SPACING: number = 20;
/** Source: `containerView.layer.cornerRadius = 25` (MapViewControllerWithContainerView.swift:38). */
const CARD_RADIUS: number = 25;
/** Map Kit's compass control is about this many vp square (measured on device). */
const COMPASS_SIZE: number = 40;
/** Source: `compass` right inset — the same 20pt as the map-type button's left one. */
const COMPASS_INSET: number = 20;

/**
 * The bundled close glyph is a BLACK template PNG and ArkUI's `fillColor` is SVG-only, so the
 * window's `.accentColor` tint is a SRC_IN blend filter over its alpha.
 */
const ACCENT: common2D.Color = { alpha: 255, red: 255, green: 146, blue: 0 };
const ACCENT_TEMPLATE_TINT: drawing.ColorFilter =
  drawing.ColorFilter.createBlendModeColorFilter(ACCENT, drawing.BlendMode.SRC_IN);

@Entry
@Component
struct WorkoutMapViewControllerPage {
  /** Source: `workout` — set by `RouteStatsView` before presenting; nil dismisses the screen. */
  @State workout: Workout | null = null;
  /** Source: `stats` — the presenting screen's `WorkoutStats`. */
  @State stats: WorkoutStats | null = null;
  /** Source: `segementedControl.selectedSegmentIndex`. */
  @State selectedSeriesIndex: number = SEGMENT_ALTITUDE;
  /** Source: `diagramView.setData(for: convertedSections)`. */
  @State diagramSeries: LineChartData | null = null;
  /** Source: `diagramView.title` — LS["WorkoutStats.Altitude"] / LS["WorkoutStats.Speed"]. */
  @State diagramTitle: string = '';
  /** Source: `mapView.mapType` — the type the chooser last applied. */
  @State mapType: mapCommon.MapType = mapCommon.MapType.STANDARD;
  /** Source: `mapTypeButton`'s own title, set to the chosen map type uppercased. */
  @State mapTypeTitle: string = localizedString('Standard');
  /** Source: `didSelect(sample:)` — the diagram point the user picked; it drops the annotation. */
  @State selectedSample: WorkoutSeriesDataSample | null = null;
  /** Source: `self.mapView != nil` — the inherited map, absent when it could not be mounted. */
  @State hasMap: boolean = false;

  private mapController: map.MapComponentController | null = null;
  /** The laid-out map-type row (vp, page coordinates): the compass sits level with its button. */
  private mapTypeRowArea: Area | null = null;
  /** Source: the single `MKPointAnnotation` the screen moves — the old one is removed first. */
  private sampleMarker: map.Marker | null = null;

  aboutToAppear(): void {
    this.setupContent();
  }

  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      /** Source: the inherited `mapView`, filling the screen behind the container card. */
      MapComponent({
        mapOptions: { position: { target: { latitude: 0, longitude: 0 }, zoom: 14 } },
        mapCallback: (err: BusinessError, controller: map.MapComponentController): void => {
          this.onMapReady(err, controller);
        }
      })
        .width('100%')
        .height('100%')
      Column() {
        /** Source: `DetailViewController` — the headline and the close button. */
        Row() {
          /**
           * Source: `headline = LS["WorkoutMapController.Headline"]`, drawn by
           * `DetailViewController` as the 32pt heavy small-caps headline. S5, measured off the
           * capture (S0057): it sits at `[20,97][330,135]` — 20pt in, BELOW the close button, and
           * in .primaryColor (this screen's headline is black over the map, not accent-tinted).
           */
          Text(localizedString('WorkoutMapController.Headline'))
            .fontSize(32)
            .fontWeight(900)
            .fontFeature('"smcp" 1')
            .lineHeight(38)
            .fontColor($r('app.color.primary_color'))
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .layoutWeight(1)
            .margin({ top: 32 })
          /** Source: `closeButton`, 36x36 tinted by window.tintColor = .accentColor. */
          Image($r('app.media.close'))
            .id('detail_close')
            .width(36)
            .height(36)
            .objectFit(ImageFit.Contain)
            .colorFilter(ACCENT_TEMPLATE_TINT)
            .onClick(() => {
              this.close();
            })
        }
        .width('100%')
        .alignItems(VerticalAlign.Top)
        /* Capture S0057, in this page's own coordinates: close at y 18, headline at y 50. */
        .padding({ left: 20, right: 10, top: 18 })
        Blank()
        /**
         * Source: `mapTypeButton` — pinned left, 10pt above the container. It exists only with a
         * map, as does the compass (which is Map Kit's own control, enabled on the controller).
         */
        if (this.hasMap) {
          Row() {
            FloatingButton({
              title: this.mapTypeTitle,
              buttonId: 'workout_map_map_type',
              onAction: (): void => {
                this.chooseMapType();
              }
            })
            Blank()
          }
          .width('100%')
          .padding({ left: 10, right: 20, bottom: 10 })
          .onAreaChange((oldArea: Area, newArea: Area): void => {
            this.mapTypeRowArea = newArea;
            this.placeCompass();
          })
        }
        /** Source: `containerView` — the bottom card holding the control and the diagram. */
        Column() {
          /**
           * Source: `segementedControl` — ONE UISegmentedControl, and the
           * `workout_map_stat_select` identifier is set on THAT control, not on a segment
           * (WorkoutMapViewController.swift:33-47); the two segments carry no identifier of
           * their own. A UISegmentedControl hit-tests the tapped point to a segment, which is
           * why the capture's centre tap on `workout_map_stat_select` selects SPEED (S0058), not
           * the already-selected Altitude. So the control is the tap target and the segment is
           * decided by which half was hit; the segments are equal halves (`layoutWeight(1)`).
           */
          Row() {
            Text(localizedString('WorkoutStats.Altitude'))
              .layoutWeight(1)
              .height('100%')
              .textAlign(TextAlign.Center)
              /* Source: `styleLikeIOS12()` — 13pt regular, white on the accent-filled selected
               * segment and .accentColor on the plain one. */
              .fontSize(13)
              .fontColor(this.selectedSeriesIndex === SEGMENT_ALTITUDE
                ? Color.White : $r('app.color.accent_color'))
              .backgroundColor(this.selectedSeriesIndex === SEGMENT_ALTITUDE
                ? $r('app.color.accent_color') : Color.Transparent)
              /* A UISegmentedControl reports its selected segment to the accessibility tree; a
               * fill colour alone does not, so the bound selection is published here too. */
              .accessibilitySelected(this.selectedSeriesIndex === SEGMENT_ALTITUDE)
            Text(localizedString('WorkoutStats.Speed'))
              .id('speed')
              .layoutWeight(1)
              .height('100%')
              .textAlign(TextAlign.Center)
              .fontSize(13)
              .fontColor(this.selectedSeriesIndex === SEGMENT_SPEED
                ? Color.White : $r('app.color.accent_color'))
              .backgroundColor(this.selectedSeriesIndex === SEGMENT_SPEED
                ? $r('app.color.accent_color') : Color.Transparent)
              /** Source: `setDividerImage(tintColorImage, ...)` — the rule between the segments. */
              .border({ width: { left: 1 }, color: $r('app.color.accent_color') })
              .accessibilitySelected(this.selectedSeriesIndex === SEGMENT_SPEED)
          }
          .id('workout_map_stat_select')
          .onClick((event: ClickEvent): void => {
            this.selectSegmentAt(event);
          })
          .width('100%')
          .height(30)
          /** Source: `styleLikeIOS12()` — `layer.borderWidth = 1` in the control's tint colour. */
          .borderRadius(8)
          .borderWidth(1)
          .borderColor($r('app.color.accent_color'))
          .clip(true)
          /**
           * Source: `diagramView` with `delegate = self`, i.e. selection ENABLED — the picked
           * sample moves the map annotation (`didSelect(sample:)`).
           */
          LabelledDiagramView({
            title: this.diagramTitle,
            data: $diagramSeries,
            selectionEnabled: true,
            onSampleSelected: (sample: WorkoutSeriesDataSample): void => {
              this.didSelectSample(sample);
            }
          })
            /** Source: `diagramView.top == segementedControl.bottom + spacing / 2`. */
            .margin({ top: CARD_SPACING / 2 })
        }
        .width('100%')
        /**
         * Source: `containerView` — .backgroundColor with a 25pt corner radius, its content inset
         * by `spacing` (MapViewControllerWithContainerView.swift:34-38, WorkoutMapViewController
         * .swift:142-151). The card overlaps the map's bottom edge by the same 25pt.
         */
        .padding(CARD_SPACING)
        .backgroundColor($r('app.color.background_color'))
        .borderRadius({ topLeft: CARD_RADIUS, topRight: CARD_RADIUS })
        // The card is opaque on iOS: a touch on it (the chart, the control) never reaches the map
        // behind the hit-transparent overlay.
        .hitTestBehavior(HitTestMode.BLOCK_HIERARCHY)
      }
      .width('100%')
      .height('100%')
      // This full-screen column sits over the map; with the default hit-test mode it swallowed every
      // pan, pinch and rotation aimed at the map, so the map could not be rotated and its compass
      // (shown only off north) never appeared (TC-MAP-019). UIKit passes touches through the empty
      // area, so this layer does too; the close and map-type buttons still take their own taps.
      .hitTestBehavior(HitTestMode.Transparent)
    }
    .id('WorkoutMapViewControllerPage')
    .width('100%')
    .height('100%')
    /** Source: `self.view.backgroundColor = .backgroundColor` — what shows where no map renders. */
    .backgroundColor($r('app.color.background_color'))
  }

  /** Source: `viewDidLoad`'s `guard let workout = workout else { dismiss }` plus the first query. */
  private async setupContent(): Promise<void> {
    const params: Record<string, string> = router.getParams() as Record<string, string>;
    const uuid: string | undefined = params !== undefined && params !== null
      ? params['workoutUUID'] : undefined;
    /* A cold deep-link launch reaches this page before the store is open, where `requireStore()`
     * throws; wait for it, as the workout detail this screen is presented from does. */
    await DataManager.ready();
    const workout: Workout | null = uuid === undefined || uuid === null || uuid === ''
      ? await this.mostRecentWorkout() : await DataManager.workout(uuid);
    if (workout === null) {
      return;
    }
    this.workout = workout;
    this.stats = await WorkoutStatsService.statsFor(workout);
    this.displayDiagramData();
    this.setupRoute();
  }

  /**
   * The source only ever reaches this screen from a workout the list handed to the detail screen,
   * so a param-less entry has no workout of its own: resolve the one that list would have handed
   * over — the most recent stored workout, the list's own default order (`startDate` descending).
   * An empty store leaves the page exactly as it is today.
   */
  private async mostRecentWorkout(): Promise<Workout | null> {
    const predicates: relationalStore.RdbPredicates =
      new relationalStore.RdbPredicates(TABLE_WORKOUT);
    predicates.orderByDesc('startDate').limitAs(1);
    try {
      const workouts: Workout[] = await DataManager.loadWorkouts(predicates, false);
      return workouts.length === 0 ? null : workouts[0];
    } catch (err) {
      return null;
    }
  }

  /** Source: `MKMapView` becoming available — then `WorkoutMapViewManager.setupRoute`. */
  private onMapReady(err: BusinessError, controller: map.MapComponentController): void {
    if (err !== undefined && err !== null && err.code !== 0) {
      return;
    }
    this.mapController = controller;
    this.hasMap = true;
    /** Source: `compass` — MKCompassButton over the map. */
    controller.setCompassControlsEnabled(true);
    this.placeCompass();
    /* MKMapView draws no zoom controls; Map Kit does unless they are turned off. */
    controller.setZoomControlsEnabled(false);
    this.setupRoute();
  }

  /**
   * Source: the `compass` constraints — right of the screen, just above the container card, level
   * with the map-type button on the left. Map Kit's default spot is the top-right corner, where it
   * covered the close button once the map was rotated.
   */
  private placeCompass(): void {
    const controller: map.MapComponentController | null = this.mapController;
    const row: Area | null = this.mapTypeRowArea;
    if (controller === null || row === null) {
      return;
    }
    const top: number = Number(row.position.y);
    const width: number = Number(row.width);
    const buttonHeight: number = Number(row.height) - 10;
    const ui: UIContext = this.getUIContext();
    controller.setCompassPosition({
      positionX: ui.vp2px(width - COMPASS_INSET - COMPASS_SIZE),
      positionY: ui.vp2px(top + (buttonHeight - COMPASS_SIZE) / 2)
    });
  }

  /**
   * Source: `WorkoutMapViewManager.setupRoute(forWorkout:mapView:customEdgePadding:)` — the route
   * polyline plus the camera fitted to it.
   */
  private setupRoute(): void {
    const controller: map.MapComponentController | null = this.mapController;
    const workout: Workout | null = this.workout;
    if (controller === null || workout === null) {
      return;
    }
    WorkoutMapViewManager.setupRoute(workout, controller, ROUTE_EDGE_PADDING);
  }

  /**
   * Source: the UISegmentedControl's own hit-testing — the tapped point picks the segment. The
   * two segments are equal halves of the control, so the tapped half IS the segment. Window
   * coordinates are used on both sides (`windowX` against the control's `globalPosition`) so the
   * result does not depend on which descendant the touch resolved to.
   */
  private selectSegmentAt(event: ClickEvent): void {
    const area: Area = event.target.area;
    const rawWidth: Length = area.width;
    const rawLeft: Length | undefined = area.globalPosition.x;
    const width: number = typeof rawWidth === 'number' ? rawWidth : 0;
    const left: number = typeof rawLeft === 'number' ? rawLeft : 0;
    if (width <= 0) {
      /* Geometry unreadable: a tap on the control still has to move it, as UIKit's would. */
      this.selectSeries(this.selectedSeriesIndex === SEGMENT_ALTITUDE
        ? SEGMENT_SPEED : SEGMENT_ALTITUDE);
      return;
    }
    this.selectSeries(event.windowX - left < width / 2 ? SEGMENT_ALTITUDE : SEGMENT_SPEED);
  }

  /** Source: `segementedControl`'s value-changed action — `displayDiagramData(sender:)`. */
  private selectSeries(index: number): void {
    this.selectedSeriesIndex = index;
    this.displayDiagramData();
  }

  /**
   * Source: `displayDiagramData(sender:)` — segment 0 queries the altitudes and titles the diagram
   * LS["WorkoutStats.Altitude"] with the altitude unit, segment 1 the speeds with the speed unit.
   */
  private async displayDiagramData(): Promise<void> {
    const stats: WorkoutStats | null = this.stats;
    if (stats === null) {
      return;
    }
    const selectedSegmentIndex: number = this.selectedSeriesIndex;
    if (selectedSegmentIndex === SEGMENT_ALTITUDE) {
      const altitudes: CachedStatsSeries = await WorkoutStatsService.queryAltitudes(stats);
      if (altitudes.series !== null) {
        this.diagramTitle = localizedString('WorkoutStats.Altitude');
        this.diagramSeries = altitudes.series.convertedForChartView(true,
          UserPreferences.altitudeMeasurementType.safeValue);
      }
      return;
    }
    const speeds: CachedStatsSeries = await WorkoutStatsService.querySpeeds(stats);
    if (speeds.series !== null) {
      this.diagramTitle = localizedString('WorkoutStats.Speed');
      this.diagramSeries = speeds.series.convertedForChartView(true,
        UserPreferences.speedMeasurementType.safeValue);
    }
  }

  /**
   * Source: `mapTypeButton`'s action — the LS["MapView.MapTypeAlert.Title"] alert offering Standard,
   * LS["MapView.MapType.Terrain"] (replacing the source's Hybrid / Satellite, see the file header)
   * and Cancel; the chosen option sets `mapView.mapType` and becomes the button's own title,
   * uppercased.
   */
  private chooseMapType(): void {
    this.mapTypeAlert.open();
  }

  /** Source: `self.mapView?.mapType = type; button.setTitle(title.uppercased(), ...)`. */
  private applyMapType(type: mapCommon.MapType, title: string): void {
    this.mapType = type;
    const controller: map.MapComponentController | null = this.mapController;
    if (controller !== null) {
      controller.setMapType(type);
    }
    this.mapTypeTitle = title;
  }

  /**
   * Source: `didSelect(sample:)` — the screen keeps ONE MKPointAnnotation: it is added to the map
   * the first time and afterwards only its `coordinate` moves. Only a ROUTE sample carries a
   * coordinate, as the source's `as? TempWorkoutRouteDataSample` cast says.
   */
  private async didSelectSample(sample: WorkoutSeriesDataSample): Promise<void> {
    this.selectedSample = sample;
    const controller: map.MapComponentController | null = this.mapController;
    if (controller === null || !(sample instanceof TempWorkoutRouteDataSample)) {
      return;
    }
    const position: mapCommon.LatLng = {
      latitude: sample.latitude, longitude: sample.longitude
    };
    /** Source: the annotation is created ONCE and then only moved. */
    const existing: map.Marker | null = this.sampleMarker;
    if (existing !== null) {
      existing.setPosition(position);
      return;
    }
    const options: mapCommon.MarkerOptions = { position: position };
    this.sampleMarker = await controller.addMarker(options);
  }

  private mapTypeAlert: CustomDialogController = new CustomDialogController({
    builder: MapTypeAlert({
      onPick: (type: mapCommon.MapType, title: string): void => {
        this.applyMapType(type, title);
      }
    }),
    /*
     * Source: `preferredStyle: .alert` — a UIAlertController alert is not dismissed by a tap outside
     * it, only by one of its actions (Cancel included). With autoCancel the second tap of a double
     * tap on the button landed on the mask and closed the chooser it had just opened (TC-MAP-018).
     */
    autoCancel: false,
    /** S5: the alert paints its own 270pt card, so ArkUI's container and insets are dropped. */
    customStyle: true,
    alignment: DialogAlignment.Center
  });

  /**
   * Source: `close()` — dismiss(animated: true) back to the workout detail.
   * A deep-linked launch has only this page on the stack, where `router.back()` exits the app
   * (the pipeline replays every state as its own launch); the source always returns to its
   * presenter, so fall back to that page.
   */
  private close(): void {
    closeTo('pages/WorkoutViewControllerPage');
  }
}

/**
 * Source: the UIAlertController `mapTypeButton` presents — `option(for:)` for .standard, with Petal
 * Maps' terrain in place of the source's .hybrid and .satellite (see the file header), plus the
 * `.cancel` option. It lives in this file because it is this screen's own alert,
 * not a shared component.
 */
@CustomDialog
struct MapTypeAlert {
  controller?: CustomDialogController;
  onPick?: (type: mapCommon.MapType, title: string) => void;

  build() {
    Column() {
      /**
       * S5, measured off the capture (S0059 `workout_map_map_type.ui.json`): the same
       * UIAlertController card as every other alert in this app — 270pt wide at `[60,292][330,565]`,
       * a 96pt header block (17pt semibold title over the 13pt message) and 44pt action rows.
       */
      Column() {
        /** Source: `title: LS["MapView.MapTypeAlert.Title"]`, `message: ...Message`. */
        Text(localizedString('MapView.MapTypeAlert.Title'))
          /** S6: UIAlertController's title token — 17pt semibold, as the capture measures it. */
          .fontSize(17)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('app.color.primary_color'))
          .textAlign(TextAlign.Center)
          .width('100%')
        Text(localizedString('MapView.MapTypeAlert.Message'))
          /** S6: the alert message token — 13pt regular. */
          .fontSize(13)
          .fontWeight(FontWeight.Normal)
          .fontColor($r('app.color.primary_color'))
          .textAlign(TextAlign.Center)
          .width('100%')
          .margin({ top: 4 })
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 20, bottom: 21 })
      this.option(mapCommon.MapType.STANDARD, localizedString('Standard'), 'map_type_standard')
      this.option(mapCommon.MapType.TERRAIN, localizedString('MapView.MapType.Terrain'),
        'map_type_terrain')
      /** Source: the `.cancel` option (action nil), which UIKit draws semibold. */
      Divider()
        .strokeWidth(0.5)
        .color($r('app.color.table_view_separator'))
      Button(localizedString('Cancel'))
        .id('cancel')
        .type(ButtonType.Normal)
        .width('100%')
        .height(44)
        .backgroundColor($r('app.color.foreground_color'))
        .fontSize(16)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('app.color.accent_color'))
        .onClick(() => {
          this.close();
        })
    }
    .width(270)
    .backgroundColor($r('app.color.foreground_color'))
    /** The UIAlertController card's own corner radius — a fixed iOS design-system value. */
    .borderRadius(14)
    .clip(true)
  }

  @Builder
  option(type: mapCommon.MapType, title: string, slug: string) {
    Divider()
      .strokeWidth(0.5)
      .color($r('app.color.table_view_separator'))
    Button(title)
      .id(slug)
      .type(ButtonType.Normal)
      .width('100%')
      .height(44)
      .backgroundColor($r('app.color.foreground_color'))
      .fontSize(16)
      .fontWeight(FontWeight.Normal)
      .fontColor($r('app.color.accent_color'))
      .onClick(() => {
        this.pick(type, title);
      })
  }

  private pick(type: mapCommon.MapType, title: string): void {
    this.close();
    if (this.onPick !== undefined) {
      this.onPick(type, title);
    }
  }

  private close(): void {
    if (this.controller !== undefined) {
      this.controller.close();
    }
  }
}
