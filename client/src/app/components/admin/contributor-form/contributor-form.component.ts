import { Component, OnInit, Inject, OnChanges } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { filter, debounceTime, switchMap } from 'rxjs/operators';
import { MatAutocompleteSelectedEvent } from '@angular/material';
import * as ol from 'openlayers';
import * as _ from 'lodash';

// Utils
import { CustomRegExp } from '../../../util/CustomRegExp';
import { AbstractContributorModifier } from '../../../abstract/abstract-contributor-modifier';

// Services
import { ContributorService } from '../../../services/contributor.service';
import { LocationService } from '../../../services/location.service';

// Classes
import { ContributorClass } from '../../../domain/contributor.class';
import { LocationClass } from '../../../domain/location.class';
import { AuthenticationService } from 'src/app/services/authentication.service';
import { NotificationsService } from 'angular2-notifications';

@Component({
  selector: 'app-contributor-form',
  templateUrl: './contributor-form.component.html',
  styleUrls: ['./contributor-form.component.css']
})
export class ContributorFormComponent extends AbstractContributorModifier implements OnInit, OnChanges {

  private static readonly RESULTS_LIMIT = 5;

  public contributorForm: FormGroup;
  public locations: LocationClass[] = [];
  public isLoading: boolean = false;

  constructor(
    @Inject(ContributorService) contributorService: ContributorService,
    @Inject(AuthenticationService) authenticationService: AuthenticationService,
    @Inject(NotificationsService) notificationsService: NotificationsService,
    private locationService: LocationService) {
    super(contributorService, authenticationService, notificationsService);
  }

  ngOnInit() {
    this.initializeForm();
  }

  ngOnChanges() {
    this.initializeForm();
  }

  initializeForm() {
    const addressCtrl = new FormControl(this.contributor.formattedAddress);
    addressCtrl.valueChanges.pipe(
      filter(data => {
        this.locations.length = 0;
        return _.isString(data) && (data.trim().length ? true : false) && (this.isLoading = true)
      }),
      debounceTime(500),
      // Using switchMap to prevent displaying data returned if another request is in progress
      switchMap(data => this.locationService.search(data, ContributorFormComponent.RESULTS_LIMIT)))
      .subscribe(data => {
        this.isLoading = false;
        this.locations = data.features;
      });

    this.contributorForm = new FormGroup({
      'title': new FormControl(this.contributor.title, Validators.required),
      'description': new FormControl(this.contributor.description),
      'name': new FormControl(this.contributor.name, Validators.required),
      'address': addressCtrl,
      'hours': new FormControl(this.contributor.hours),
      'email': new FormControl(this.contributor.email, Validators.email),
      'phone': new FormControl(this.contributor.phone)
    });
  }

  /**
   * When user select a result among the list
   * 
   * @param event Clicked result
   */
  public onLocationSelected(event: MatAutocompleteSelectedEvent) {
    const location: LocationClass = event.option.value;
    this.contributorForm.get('address').setValue(location.properties.label);
    const transformedLocation = ol.proj.fromLonLat(location.geometry.coordinates, 'EPSG:3857');
    Object.assign(this.contributor, {
      longitude: Math.round(transformedLocation[0]),
      latitude: Math.round(transformedLocation[1]),
      houseNumber: location.properties.housenumber,
      street: location.properties.street ? location.properties.street : location.properties.name,
      zipcode: location.properties.postcode,
      city: location.properties.city
    });
  }

  public submitForm(value, goBack: boolean = false) {
    Object.assign(this.contributor, value);
    if (this.contributorForm.get('title').invalid || this.contributorForm.get('name').invalid) {
      this.backwardPressed.emit(this.contributor);
    } else {
      this.saveContributor(this.contributor, goBack).subscribe((contributor) =>
        this.contributorService.contributorLocationChanged.next(contributor));
    }
  }

}
