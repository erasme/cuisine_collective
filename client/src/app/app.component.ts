import { Component, ViewChild, ElementRef, AfterViewInit, OnInit, OnDestroy } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import * as _ from 'lodash';
import * as ol from 'openlayers';
import { Router, NavigationEnd, UrlSegmentGroup } from '@angular/router';
import { AuthenticationService } from './services/authentication.service';
import { EventService } from './services/event.service';
import { EventClass } from './domain/event.class';
import { ContributorClass } from './domain/contributor.class';
import { Subscription } from 'rxjs';
import { ContributorService } from './services/contributor.service';
import { filter } from 'rxjs/operators';
import { ArrayUtils } from './util/ArrayUtils';
import { EventEditionComponent } from './components/event-edition/event-edition.component';
import { ContributorEditionComponent } from './components/contributor-edition/contributor-edition.component';
import { ItemClass } from './domain/items-list.class';
import { AdminFiltersComponent } from './components/admin/admin-filters/admin-filters.component';
import { UserClass } from './domain/user.class';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {

  public readonly notificationOptions = {
    showProgressBar: true,
    timeOut: 3000
  }

  public showSidenav: boolean = false;
  private connectedUser: UserClass;

  /**
   * All events received from query
   */
  private allEvents: EventClass[] = [];
  /**
   * All events but same location events
   */
  private events: EventClass[] = [];
  private get ownedPublishedEvents(): EventClass[] { return this.events.filter(x => x.publish && this.connectedUser && x.userId === this.connectedUser.id) }
  private get notOwnedPublishedEvents(): EventClass[] { return this.events.filter(x => x.publish && (!this.connectedUser || x.userId !== this.connectedUser.id)) }
  private get ownedNotPublishedEvents(): EventClass[] { return this.events.filter(x => !x.publish && this.connectedUser && x.userId === this.connectedUser.id) }
  private get notOwnedNotPublishedEvents(): EventClass[] { return this.events.filter(x => !x.publish && (!this.connectedUser || x.userId !== this.connectedUser.id)) }
  /**
   * All contributors received from query
   */
  private allContributors: ContributorClass[] = [];
  /**
   * All contributors but same location contributors
   */
  private contributors: ContributorClass[] = [];
  private get ownedContributors(): ContributorClass[] { return this.contributors.filter(x => this.connectedUser && x.userId === this.connectedUser.id) }
  private get notOwnedContributors(): ContributorClass[] { return this.contributors.filter(x => !this.connectedUser || x.userId !== this.connectedUser.id) }
  /**
   * TODO reverse logic
   * Same location contributors/events
   */
  public sameLocationItems: ItemClass[] = [];
  public get ownedSameLocationItems(): ItemClass[] { return this.sameLocationItems.filter(x => this.connectedUser && x.itemsList.some(i => i.userId === this.connectedUser.id)) }
  public get notOwnedSameLocationItems(): ItemClass[] { return this.sameLocationItems.filter(x => !this.connectedUser || x.itemsList.every(i => i.userId !== this.connectedUser.id)) }

  /**
   * Is sidenav in edition mode ?
   */
  public sidenavEdition: boolean = false;

  @ViewChild('itemsList') public itemsList: ElementRef;
  @ViewChild('map') public mapElement: ElementRef;
  private readonly initialCoordinates: [number, number] = [538262.3872128094, 5740786.2887582248];
  private readonly initialZoom: number = 13;
  private readonly searchZoom: number = 16;
  private map: ol.Map;

  public popupContent: SafeHtml;
  private selectInteraction: ol.interaction.Select;

  private get eventsFeatures(): ol.Feature[] { return this.ownedPublishedEventsFeatures.concat(this.notOwnedPublishedEventsFeatures).concat(this.ownedNotPublishedEventsFeatures).concat(this.notOwnedNotPublishedEventsFeatures) }
  private get contributorsFeatures(): ol.Feature[] { return this.ownedContributorsFeatures.concat(this.notOwnedContributorsFeatures) };
  private get sameLocationItemFeatures(): ol.Feature[] { return this.ownedSameLocationItemFeatures.concat(this.notOwnedSameLocationItemFeatures) };
  // Features
  private ownedPublishedEventsFeatures: ol.Feature[] = [];
  private notOwnedPublishedEventsFeatures: ol.Feature[] = [];
  private ownedNotPublishedEventsFeatures: ol.Feature[] = [];
  private notOwnedNotPublishedEventsFeatures: ol.Feature[] = [];
  private ownedContributorsFeatures: ol.Feature[] = [];
  private notOwnedContributorsFeatures: ol.Feature[] = [];
  private ownedSameLocationItemFeatures: ol.Feature[] = [];
  private notOwnedSameLocationItemFeatures: ol.Feature[] = [];

  // Layers
  private ownedPublishedEventsLayer: ol.layer.Vector;
  private notOwnedPublishedEventsLayer: ol.layer.Vector;
  private ownedNotPublishedEventsLayer: ol.layer.Vector;
  private notOwnedNotPublishedEventsLayer: ol.layer.Vector;
  private ownedContributorsLayer: ol.layer.Vector;
  private notOwnedContributorsLayer: ol.layer.Vector;
  private ownedSameLocationItemLayer: ol.layer.Vector;
  private notOwnedSameLocationItemLayer: ol.layer.Vector;

  // Styles
  private readonly ownedPublishedEventStyle: ol.style.Style;
  private readonly notOwnedPublishedEventStyle: ol.style.Style;
  private readonly ownedNotPublishedEventStyle: ol.style.Style;
  private readonly notOwnedNotPublishedEventStyle: ol.style.Style;
  private readonly ownedContributorStyle: ol.style.Style;
  private readonly notOwnedContributorStyle: ol.style.Style;
  private readonly ownedSameLocationEventStyle: ol.style.Style;
  private readonly notOwnedSameLocationEventStyle: ol.style.Style;
  private readonly ownedSameLocationContributorStyle: ol.style.Style;
  private readonly notOwnedSameLocationContributorStyle: ol.style.Style;
  private readonly selectedLocationPinStyle: ol.style.Style;
  private readonly selectedEditLocationPinStyle: ol.style.Style;
  private readonly selectedSameLocationPinStyle: ol.style.Style;

  // Event & contributors subscription
  private subscriptionEventLocationChanged: Subscription;
  private subscriptionContributorLocationChanged: Subscription;
  private subscriptionEventPublishStatusChanged: Subscription;
  private subscriptionEventDeleted: Subscription;
  private subscriptionContributorDeleted: Subscription;

  constructor(
    private router: Router,
    private eventService: EventService,
    private contributorService: ContributorService,
    private authenticationService: AuthenticationService,
    private domSanitizer: DomSanitizer
  ) {
    this.connectedUser = this.authenticationService.user;
    // Init all styles
    this.ownedPublishedEventStyle = this.initStyle('assets/location_on.svg', Color.OWNED);
    this.notOwnedPublishedEventStyle = this.initStyle('assets/location_on.svg', Color.EVENT);
    this.ownedNotPublishedEventStyle = this.initStyle('assets/edit_location.svg', Color.OWNED);
    this.notOwnedNotPublishedEventStyle = this.initStyle('assets/edit_location.svg', Color.EVENT);
    this.ownedContributorStyle = this.initStyle('assets/location_on.svg', Color.OWNED);
    this.notOwnedContributorStyle = this.initStyle('assets/location_on.svg', Color.CONTRIBUTOR);
    this.ownedSameLocationEventStyle = this.initStyle('assets/add_location.svg', Color.OWNED);
    this.notOwnedSameLocationEventStyle = this.initStyle('assets/add_location.svg', Color.EVENT);
    this.ownedSameLocationContributorStyle = this.initStyle('assets/add_location.svg', Color.OWNED);
    this.notOwnedSameLocationContributorStyle = this.initStyle('assets/add_location.svg', Color.CONTRIBUTOR);
    this.selectedLocationPinStyle = this.initStyle('assets/location_on.svg', Color.SELECTED);
    this.selectedEditLocationPinStyle = this.initStyle('assets/edit_location.svg', Color.SELECTED);
    this.selectedSameLocationPinStyle = this.initStyle('assets/add_location.svg', Color.SELECTED);
  }

  private initStyle(svgSrc: string, color: Color): ol.style.Style {
    let canvas = this.addWhiteOutlineToMarker(svgSrc, color);
    return new ol.style.Style({
      image: new ol.style.Icon({
        img: canvas,
        imgSize: canvas ? [canvas.width, canvas.height] : undefined,
        anchor: [0.5, 1]
      })
    });
  }

  /**
   * Adds a white outline to a given marker with a given color
   * 
   * @param src URL of the marker SVG file
   * @param color Color of the marker
   * @returns The canvas to render
   */
  private addWhiteOutlineToMarker(src: string, color: string): HTMLCanvasElement {
    //Initialize canvas
    var canvas = document.createElement('canvas');
    canvas.height = 80;
    canvas.width = 80;
    var ctx = canvas.getContext('2d');

    //Initialize images
    var markerImage = new Image();
    var backgroundImage = new Image();

    //Load marker image
    var xhr = new XMLHttpRequest();
    xhr.open("GET", src);
    xhr.send();
    xhr.onload = () => {
      var svg = xhr.responseXML.documentElement;
      svg.getElementsByTagName('path')[0].setAttribute('fill', color);
      markerImage.src = 'data:image/svg+xml;base64,' + btoa(svg.outerHTML);
    };

    //Load background image
    var xhr2 = new XMLHttpRequest();
    xhr2.open("GET", 'assets/marker_background.svg');
    xhr2.send();
    xhr2.onload = () => {
      var svg = xhr2.responseXML.documentElement;
      backgroundImage.src = 'data:image/svg+xml;base64,' + btoa(svg.outerHTML);
    };

    //Wrap markerImage.onload into a Promise
    var markerImageLoaded = new Promise((resolve) => {
      markerImage.onload = () => {
        resolve();
      };
    });

    //Wrap backgroundImage.onload into a Promise
    var backgroundImageLoaded = new Promise((resolve) => {
      backgroundImage.onload = () => {
        resolve();
      };
    });

    //Draw canvas
    Promise.all([markerImageLoaded, backgroundImageLoaded]).then(() => {
      ctx.drawImage(backgroundImage, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      //x offset: (88 - 72) / 2
      //y offset: (88 - 72) * 0.38 because the center of the circle is approximately at 38% height from the top
      ctx.drawImage(markerImage, 8, 6);
    });
    return canvas;
  }

  ngOnInit() {
    this.authenticationService.connectionStatusChanged.subscribe((connected) => {
      if (connected === true || connected === false) {
        this.connectedUser = this.authenticationService.user;
        this.popupContent = '';
        // Load only events & clean contributors from screen
        this.eventService.getAll().subscribe(events => {
          // Change same location item style
          this.ownedSameLocationItemLayer.setStyle(this.ownedSameLocationEventStyle);
          this.notOwnedSameLocationItemLayer.setStyle(this.notOwnedSameLocationEventStyle);
          // Compute lists
          this.allEvents = events;
          this.allContributors = [];
          this.computeSameLocationItems();

          this.unloadFilteredEventOrContributor();
          this.redrawAll();
        });
      }
    });

    // To handle click on popup results
    this.itemsList.nativeElement.addEventListener('click', (e) => {
      if (!e.target.id) {
        return;
      }
      if (e.target.className.indexOf('event') >= 0) {
        this.router.navigate([...this.routingUrls.events, e.target.id.split('-')[1]]);
      } else if (e.target.className.indexOf('contributor') >= 0) {
        this.router.navigate([...this.routingUrls.contributors, e.target.id.split('-')[1]]);
      }
    });

    this.subscriptionEventLocationChanged = this.eventService.eventLocationChanged.subscribe((event) => {
      if (event) {
        // Update in array and redraw
        _.remove(this.allEvents, { id: event.id });
        this.allEvents.push(event);
        this.computeSameLocationItems();
        this.redrawAll();
        // Re-select
        this.selectAndGoToEvent(event);
      }
    });

    this.subscriptionContributorLocationChanged = this.contributorService.contributorLocationChanged.subscribe((contributor) => {
      if (contributor) {
        // Update in array and redraw
        _.remove(this.allContributors, { id: contributor.id });
        this.allContributors.push(contributor);
        this.computeSameLocationItems();
        this.redrawAll();
        // Re-select
        this.selectAndGoToContributor(contributor);
      }
    });

    this.subscriptionEventPublishStatusChanged = this.eventService.eventPublishStatusChanged.subscribe((event) => {
      if (event) {
        const oldEvent = _.find(this.allEvents, { id: event.id });
        if (!oldEvent) {
          this.allEvents.push(event);
          this.computeSameLocationItems();
        } else if (oldEvent.publish === event.publish) {
          // If event already displayed and publish status not changed, do nothing
          return;
        } else {
          oldEvent.publish = event.publish;

        }
        this.redrawAll();
        // Re-select
        this.selectAndGoToEvent(event);
      }
    });

    this.subscriptionEventDeleted = this.eventService.eventDeleted.subscribe((eventId) => {
      if (eventId) {
        this.selectInteraction.getFeatures().clear();
        _.remove(this.allEvents, { id: eventId });
        this.computeSameLocationItems();
        this.redrawAll();
      }
    });

    this.subscriptionContributorDeleted = this.contributorService.contributorDeleted.subscribe((contributorId) => {
      if (contributorId) {
        this.selectInteraction.getFeatures().clear();
        _.remove(this.allContributors, { id: contributorId });
        this.computeSameLocationItems();
        this.redrawAll();
      }
    });
  }

  private selectAndGoToEvent(event: EventClass) {
    this.selectInteraction.getFeatures().clear();
    this.popupContent = '';
    // Find event and mark as selected
    const featureToSelect = this.eventsFeatures.find(x => x.get('object').id === event.id)
      || this.sameLocationItemFeatures.find(x => x.get('object').itemsList.some(i => i instanceof EventClass && i.id === event.id));
    if (featureToSelect) {
      this.selectInteraction.getFeatures().push(featureToSelect);
    }
    // Go to point
    this.goTo([event.longitude, event.latitude], 'EPSG:4326');
  }

  private selectAndGoToContributor(contributor: ContributorClass) {
    this.selectInteraction.getFeatures().clear();
    this.popupContent = '';
    // Find contributor and mark as selected
    const featureToSelect = this.contributorsFeatures.find(x => x.get('object').id === contributor.id)
      || this.sameLocationItemFeatures.find(x => x.get('object').itemsList.some(i => i instanceof ContributorClass && i.id === contributor.id));
    if (featureToSelect) {
      this.selectInteraction.getFeatures().push(featureToSelect);
    }
    // Go to point
    this.goTo([contributor.longitude, contributor.latitude], 'EPSG:4326');
  }

  ngOnDestroy() {
    this.subscriptionEventLocationChanged.unsubscribe();
    this.subscriptionContributorLocationChanged.unsubscribe();
    this.subscriptionEventPublishStatusChanged.unsubscribe();
    this.subscriptionEventDeleted.unsubscribe();
    this.subscriptionContributorDeleted.unsubscribe();
  }

  private get routingUrls() {
    const admin = 'admin';
    const events = 'events';
    const contributors = 'contributors';
    const root = '';

    const routes = {
      events: this.authenticationService.isConnected ? [admin, events] : [events],
      contributors: this.authenticationService.isConnected ? [admin, contributors] : [contributors],
      root: this.authenticationService.isConnected ? [admin, root] : [root]
    }
    return routes;
  }

  /**
   * Center the map on the given coordinates
   * 
   * @param coordinates coordinates (longitude - latitude)
   */
  public goTo(coordinates: [number, number], projection: string | ol.proj.Projection = 'EPSG:3857') {
    this.map.set('view', new ol.View({
      center: ol.proj.fromLonLat(coordinates, projection),
      zoom: this.searchZoom
    }));
  }

  ngAfterViewInit(): void {
    this.eventService.getAll().subscribe((events) => {
      this.allEvents = events;
      this.allContributors = [];
      this.computeSameLocationItems();

      this.initializeMap();

      //Select the right marker when URL is "/events/:id" or "/contributors/:id"
      const currentUrl = this.router.parseUrl(this.router.url).root.children.primary
      this.selectCurrentMarker(currentUrl);
      this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(res => {
        const currentUrl = this.router.parseUrl((<NavigationEnd>res).urlAfterRedirects).root.children.primary;
        this.selectCurrentMarker(currentUrl);
      });
    });
  }

  private selectCurrentMarker(currentUrl: UrlSegmentGroup) {
    if (!currentUrl) return;

    this.selectInteraction.getFeatures().clear();
    this.popupContent = '';
    let pathToCompare;
    let next;

    if (this.authenticationService.isConnected) {
      pathToCompare = currentUrl.segments.map(x => x.path).slice(0, 2);
      next = currentUrl.segments[2];
    }
    else {
      pathToCompare = currentUrl.segments.map(x => x.path).slice(0, 1);
      next = currentUrl.segments[1];
    }

    let featureToSelect = undefined;

    if (ArrayUtils.compareSortedArrays(pathToCompare, this.routingUrls.events) && !isNaN(+next)) {
      featureToSelect = this.eventsFeatures.find(x => x.get('object').id === +next);

      if (featureToSelect) {
        // The feature is not in events list
        this.selectInteraction.getFeatures().push(featureToSelect);
      } else {
        // Look for the feature in the "same location items" list
        featureToSelect = this.sameLocationItemFeatures.find(x =>
          _.find(x.get('object').itemsList, (item) => {
            return item instanceof EventClass && item.id === +next;
          }));

        if (featureToSelect) {
          this.initPopupContent(featureToSelect, 'event-' + next);
          // Feature is part of a list - add class to the right div
          this.selectInteraction.getFeatures().push(featureToSelect);
        } else {
          // Item is not displayed anywhere, then we go to root
          this.router.navigate(this.routingUrls.root);
        }
      }
    } else if (ArrayUtils.compareSortedArrays(pathToCompare, this.routingUrls.contributors) && !isNaN(+next)) {
      featureToSelect = this.contributorsFeatures.find(x => x.get('object').id === +next);

      if (featureToSelect) {
        this.selectInteraction.getFeatures().push(featureToSelect);
      } else {
        // Look for the feature in the "same location items" list
        featureToSelect = this.sameLocationItemFeatures.find(x =>
          _.find(x.get('object').itemsList, (item) => {
            return item instanceof ContributorClass && item.id === +next;
          }));

        if (featureToSelect) {
          this.initPopupContent(featureToSelect, 'contributor-' + next);
          // Feature is part of a list - add class to the right div
          this.selectInteraction.getFeatures().push(featureToSelect);
        } else {
          // Item is not displayed anywhere, then we go to root
          this.router.navigate(this.routingUrls.root);
        }
      }
    }
  }

  private unloadFilteredEventOrContributor() {
    const currentUrl = this.router.parseUrl(this.router.url).root.children.primary;
    if (currentUrl) {

      this.selectInteraction.getFeatures().clear();

      let pathToCompare;
      let next;

      if (this.authenticationService.isConnected) {
        pathToCompare = currentUrl.segments.map(x => x.path).slice(0, 2);
        next = currentUrl.segments[2];
      }
      else {
        pathToCompare = currentUrl.segments.map(x => x.path).slice(0, 1);
        next = currentUrl.segments[1];
      }

      if (next) {
        if (ArrayUtils.compareSortedArrays(pathToCompare, this.routingUrls.events)) {
          if (!this.events.find(x => x.id === +next)) {
            // If event is not in events list
            this.router.navigate(this.routingUrls.root);
          } else {
            var item = _.find(this.sameLocationItems, sameLocationItem => _.find(sameLocationItem.itemsList, (item) => {
              return item instanceof EventClass && item.id === +next;
            }));
            if (!item) {
              // If event is not in "same location items" list
              this.router.navigate(this.routingUrls.root);
            }
          }
        }
        else if (ArrayUtils.compareSortedArrays(pathToCompare, this.routingUrls.contributors)) {
          if (!this.contributors.find(x => x.id === +next)) {
            // If contributor is not in contributors list
            this.router.navigate(this.routingUrls.root);
          } else {
            var item = _.find(this.sameLocationItems, sameLocationItem => _.find(sameLocationItem.itemsList, (item) => {
              return item instanceof ContributorClass && item.id === +next;
            }));
            if (!item) {
              // If contributor is not in "same location items" list
              this.router.navigate(this.routingUrls.root);
            }
          }
        }
      } else {
        this.popupContent = '';
      }
    }
  }

  private initializeMap() {
    this.initializeSelectInteraction();
    this.initFeaturesAndLayers();

    this.map = new ol.Map({
      layers: [
        new ol.layer.Tile({
          source: new ol.source.OSM()
        }),
        this.ownedPublishedEventsLayer,
        this.notOwnedPublishedEventsLayer,
        this.ownedNotPublishedEventsLayer,
        this.notOwnedNotPublishedEventsLayer,
        this.ownedContributorsLayer,
        this.notOwnedContributorsLayer,
        this.ownedSameLocationItemLayer,
        this.notOwnedSameLocationItemLayer
      ],
      target: this.mapElement.nativeElement,
      controls: ol.control.defaults({
        attribution: false,
        zoom: true,
        rotate: false
      }),
      interactions:
        ol.interaction.defaults({ doubleClickZoom: false }).extend([
          this.selectInteraction
        ]),
      view: new ol.View({
        center: this.initialCoordinates,
        zoom: this.initialZoom
      })
    });

    // change mouse cursor when over marker
    this.map.on('pointermove', (e) => {
      var pixel = this.map.getEventPixel(e['originalEvent']);
      var mapDiv = (this.map.getTarget() as Element)

      this.map.hasFeatureAtPixel(pixel) ? mapDiv.classList.add("clickable") : mapDiv.classList.remove("clickable");
    });
  }

  private initializeSelectInteraction() {
    this.selectInteraction = new ol.interaction.Select({
      multi: false,
      style: (feature: (ol.Feature | ol.render.Feature), resolution: number) => {
        if (feature.getProperties().object instanceof ItemClass) {
          return this.selectedSameLocationPinStyle;
        } else if (feature.getProperties().object instanceof EventClass && !feature.getProperties().object.publish) {
          return this.selectedEditLocationPinStyle;
        }
        return this.selectedLocationPinStyle;
      },
      hitTolerance: 10
    });

    this.selectInteraction.on('select', (e: ol.interaction.Select.Event) => {
      if (e.selected && e.target.getFeatures().item(0)) {
        if (e.target.getFeatures().item(0).get('object') instanceof EventClass) {
          this.popupContent = '';
          this.router.navigate([...this.routingUrls.events, e.target.getFeatures().item(0).getProperties().object.id]);
        }
        else if (e.target.getFeatures().item(0).get('object') instanceof ContributorClass) {
          this.popupContent = '';
          this.router.navigate([...this.routingUrls.contributors, e.target.getFeatures().item(0).getProperties().object.id]);
        } else if (e.target.getFeatures().item(0).get('object') instanceof ItemClass) {
          this.initPopupContent(e.target.getFeatures().item(0));
        }
      }
      else {
        this.popupContent = '';
        this.router.navigate(this.routingUrls.root);
      }
    });
  }

  private initFeaturesAndLayers() {
    this.ownedPublishedEventsFeatures = this.initFeatures(this.ownedPublishedEvents);
    this.ownedPublishedEventsLayer = this.initLayer(this.ownedPublishedEventsFeatures, this.ownedPublishedEventStyle);

    this.notOwnedPublishedEventsFeatures = this.initFeatures(this.notOwnedPublishedEvents);
    this.notOwnedPublishedEventsLayer = this.initLayer(this.notOwnedPublishedEventsFeatures, this.notOwnedPublishedEventStyle);

    this.ownedNotPublishedEventsFeatures = this.initFeatures(this.ownedNotPublishedEvents);
    this.ownedNotPublishedEventsLayer = this.initLayer(this.ownedNotPublishedEventsFeatures, this.ownedNotPublishedEventStyle);

    this.notOwnedNotPublishedEventsFeatures = this.initFeatures(this.notOwnedNotPublishedEvents);
    this.notOwnedNotPublishedEventsLayer = this.initLayer(this.notOwnedNotPublishedEventsFeatures, this.notOwnedNotPublishedEventStyle);

    this.ownedContributorsFeatures = this.initFeatures(this.ownedContributors);
    this.ownedContributorsLayer = this.initLayer(this.ownedContributorsFeatures, this.ownedContributorStyle);

    this.notOwnedContributorsFeatures = this.initFeatures(this.notOwnedContributors);
    this.notOwnedContributorsLayer = this.initLayer(this.notOwnedContributorsFeatures, this.notOwnedContributorStyle);

    this.ownedSameLocationItemFeatures = this.initFeatures(this.ownedSameLocationItems);
    this.ownedSameLocationItemLayer = this.initLayer(this.ownedSameLocationItemFeatures, this.ownedSameLocationEventStyle);

    this.notOwnedSameLocationItemFeatures = this.initFeatures(this.notOwnedSameLocationItems);
    this.notOwnedSameLocationItemLayer = this.initLayer(this.notOwnedSameLocationItemFeatures, this.notOwnedSameLocationEventStyle);
  }

  private initFeatures(sources: (ContributorClass | EventClass | ItemClass)[]): ol.Feature[] {
    return sources.map((source) =>
      new ol.Feature({
        geometry: new ol.geom.Point([source.longitude, source.latitude]),
        object: source
      })
    );
  }

  private initLayer(features: ol.Feature[], style: ol.style.Style) {
    const markerSource = new ol.source.Vector({ features: features });
    return new ol.layer.Vector({
      source: markerSource,
      style: style
    });
  }

  public onPrimaryRouterActivate(elementRef: ElementRef) {
    if (elementRef instanceof ContributorEditionComponent || elementRef instanceof EventEditionComponent) {
      this.sidenavEdition = true;
    } else {
      this.sidenavEdition = false;
    }
    this.showSidenav = true;
  }

  public onPrimaryRouterDeactivate() {
    this.showSidenav = false;
  }

  /**
   * Subscribe to router outlet's child component's event
   * @param elementRef sidenav
   */
  public onActivate(elementRef: AdminFiltersComponent) {
    // Event filter of the filters menu
    elementRef.filterEvents.subscribe(filters => {
      this.eventService.getAll(filters).subscribe(events => {
        // Change same location item style
        this.ownedSameLocationItemLayer.setStyle(this.ownedSameLocationEventStyle);
        this.notOwnedSameLocationItemLayer.setStyle(this.notOwnedSameLocationEventStyle);
        // Redraw only events
        this.allEvents = events;
        this.allContributors = [];
        this.computeSameLocationItems();

        this.unloadFilteredEventOrContributor();
        this.redrawAll();
      });
    });
    elementRef.filterContributors.subscribe(filters => {
      this.contributorService.getAll(filters).subscribe(contributors => {
        // Change same location item style
        this.ownedSameLocationItemLayer.setStyle(this.ownedSameLocationContributorStyle);
        this.notOwnedSameLocationItemLayer.setStyle(this.notOwnedSameLocationContributorStyle);
        // Redraw only contributors
        this.allEvents = [];
        this.allContributors = contributors;
        this.computeSameLocationItems();

        this.unloadFilteredEventOrContributor();
        this.redrawAll();
      });
    });
  }

  private redrawAll() {
    this.selectInteraction.getFeatures().clear();
    this.redrawEvents();
    this.redrawContributors();
    this.redrawSameLocationItems();
  }

  /**
   * Remove all events from layer then add the new ones
   */
  private redrawEvents() {
    this.ownedPublishedEventsFeatures = this.redrawLayerFeatures(this.ownedPublishedEventsLayer, this.ownedPublishedEvents);
    this.notOwnedPublishedEventsFeatures = this.redrawLayerFeatures(this.notOwnedPublishedEventsLayer, this.notOwnedPublishedEvents);
    this.ownedNotPublishedEventsFeatures = this.redrawLayerFeatures(this.ownedNotPublishedEventsLayer, this.ownedNotPublishedEvents);
    this.notOwnedNotPublishedEventsFeatures = this.redrawLayerFeatures(this.notOwnedNotPublishedEventsLayer, this.notOwnedNotPublishedEvents);
  }

  /**
   * Remove all contributors from layer then add the new ones
   */
  private redrawContributors() {
    this.ownedContributorsFeatures = this.redrawLayerFeatures(this.ownedContributorsLayer, this.ownedContributors);
    this.notOwnedContributorsFeatures = this.redrawLayerFeatures(this.notOwnedContributorsLayer, this.notOwnedContributors);
  }

  /**
   * Remove all same location items from layer then add the new ones
   */
  private redrawSameLocationItems() {
    this.ownedSameLocationItemFeatures = this.redrawLayerFeatures(this.ownedSameLocationItemLayer, this.ownedSameLocationItems);
    this.notOwnedSameLocationItemFeatures = this.redrawLayerFeatures(this.notOwnedSameLocationItemLayer, this.notOwnedSameLocationItems);
  }

  /**
   * Redraw layer's features from a list of items
   */
  private redrawLayerFeatures(layer: ol.layer.Vector, items: (ContributorClass | EventClass | ItemClass)[]): ol.Feature[] {
    const features = this.initFeatures(items);
    layer.getSource().clear();
    layer.getSource().addFeatures(features);
    return features;
  }

  /**
   * Group events & contributors which are on the same location
   */
  private computeSameLocationItems() {
    this.events = [].concat(this.allEvents);
    this.contributors = [].concat(this.allContributors);
    this.sameLocationItems = [];

    /**
     * Group events or contributors by coordinates
     * 
     * @param items 
     */
    function groupByCoordinates(items: (ContributorClass | EventClass)[], sameLocationItems: ItemClass[]) {
      items.forEach((item) => {
        // Find existing group for item's location
        var sameLocationItem = _.find(sameLocationItems, { longitude: item.longitude, latitude: item.latitude });
        if (sameLocationItem) {
          // Add item to the existing items' group
          sameLocationItem.itemsList.push(item);
        } else {
          sameLocationItems.push(new ItemClass({
            longitude: item.longitude,
            latitude: item.latitude,
            itemsList: new Array(item)
          }));
        }
      });
    }

    groupByCoordinates(this.events, this.sameLocationItems);
    groupByCoordinates(this.contributors, this.sameLocationItems);
    // Remove item if not at least 2 element has the same coordinate
    this.sameLocationItems = _.reject(this.sameLocationItems, sameLocationItem => sameLocationItem.itemsList.length < 2);

    // Remove same location items from event & contributor lists
    this.sameLocationItems.forEach((sameLocationItem) => {
      sameLocationItem.itemsList.forEach((item) => {
        if (item instanceof EventClass) {
          _.remove(this.events, { id: item.id });
        } else if (item instanceof ContributorClass) {
          _.remove(this.contributors, { id: item.id });
        } else {
          throw new Error('Invalid item type');
        }
      })
    })
  }

  private initPopupContent(feature, elementId?: string) {
    // Add new overlay
    const popup = new ol.Overlay({
      element: document.getElementById('itemsList')
    });
    this.map.addOverlay(popup);

    // Set popup position
    var coordinate = feature.getGeometry().getCoordinates();
    popup.setPosition(coordinate);

    // Fill popup content
    var theHtmlString = '';
    _.each(feature.get('object').itemsList, (item: ContributorClass | EventClass) => {
      const type = item instanceof EventClass ? 'event' : 'contributor';
      const id = type + '-' + item.id;
      const owned = this.connectedUser && item.userId === this.connectedUser.id;
      theHtmlString += '<div class="item ' + (id === elementId ? ' selected ' : '') + type + (owned ? ' owned' : '') + '"><span class="' + type + '" id="' + id + '">';
      let designation;
      if (item instanceof EventClass) {
        designation = item.name;
        theHtmlString += item.publish ? '<i class="material-icons">location_on</i>' : '<i class="material-icons">edit_location</i>';
      } else {
        designation = item.title;
        theHtmlString += '<i class="material-icons">location_on</i>';
      }
      theHtmlString += designation ? designation : 'Sans nom' + '</span><i class="material-icons">keyboard_arrow_right</i>';
      theHtmlString += '</div>';
    });

    this.popupContent = this.transform(theHtmlString);
  }

  private transform(html: string): SafeHtml {
    return this.domSanitizer.bypassSecurityTrustHtml(html);
  }

  public get isConnected() {
    return this.authenticationService.isConnected;
  }
}

enum Color {
  EVENT = '#6CCACC',
  CONTRIBUTOR = '#0D70CD',
  SELECTED = '#FF5555',
  OWNED = "#FEC344"
}