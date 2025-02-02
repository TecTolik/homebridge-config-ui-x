import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { take } from 'rxjs/operators';

import { ApiService } from '@/app/core/api.service';
import { WsService } from '@/app/core/ws.service';
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service';

@Component({
  selector: 'app-plugins',
  templateUrl: './plugins.component.html',
  styleUrls: ['./plugins.component.scss'],
})
export class PluginsComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('child-bridges');

  public installedPlugins: any = [];
  public childBridges = [];
  public form: FormGroup;

  public loading = true;
  public searchQuery: string;
  private navigationSubscription;

  constructor(
    private $api: ApiService,
    private $ws: WsService,
    private $plugin: ManagePluginsService,
    private $router: Router,
    private $route: ActivatedRoute,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) { }

  async ngOnInit() {
    this.io.connected.subscribe(async () => {
      this.getChildBridgeMetadata();
      this.io.socket.emit('monitor-child-bridge-status');
    });

    this.io.socket.on('child-bridge-status-update', (data) => {
      const existingBridge = this.childBridges.find(x => x.username === data.username);
      if (existingBridge) {
        Object.assign(existingBridge, data);
      } else {
        this.childBridges.push(data);
      }
    });

    this.navigationSubscription = this.$router.events.subscribe((e: any) => {
      // If it is a NavigationEnd event re-initalise the component
      if (e instanceof NavigationEnd) {
        this.loadInstalledPlugins();
      }
    });

    this.form = new FormGroup({
      query: new FormControl('', [Validators.required]),
    });

    // load list of installed plugins
    await this.loadInstalledPlugins();
  }

  async loadInstalledPlugins() {
    this.form.setValue({ query: '' });

    this.installedPlugins = [];
    this.loading = true;

    try {
      this.installedPlugins = await this.$api.get(`/plugins`).toPromise();
      this.loading = false;
    } catch (err) {
      this.$toastr.error(
        `${this.$translate.instant('plugins.toast_failed_to_load_plugins')}: ${err.message}`,
        this.$translate.instant('toast.title_error'),
      );
    }

    this.$route.queryParams.pipe(take(1)).subscribe(async (params) => {
      if (params.installed && this.installedPlugins.find(x => x.name === params.installed)) {
        this.$plugin.settings(this.installedPlugins.find(x => x.name === params.installed))
          .finally(() => {
            this.$router.navigate([], {
              queryParams: {},
            });
          });
      }
    });
  }

  search() {
    this.installedPlugins = [];
    this.loading = true;

    this.$api.get(`/plugins/search/${encodeURIComponent(this.form.value.query)}`).subscribe(
      (data) => {
        this.installedPlugins = data;
        this.loading = false;
      },
      (err) => {
        this.loading = false;
        this.$toastr.error(`${err.error.message || err.message}`, 'Error');
        this.loadInstalledPlugins();
      },
    );
  }

  onClearSearch() {
    this.form.setValue({ query: '' });
    this.loadInstalledPlugins();
  }

  onSubmit({ value, valid }) {
    if (!value.query.length) {
      this.loadInstalledPlugins();
    } else {
      this.search();
    }
  }

  getChildBridgeMetadata() {
    this.io.request('get-homebridge-child-bridge-status').subscribe((data) => {
      this.childBridges = data;
    });
  }

  getPluginChildBridges(plugin) {
    return this.childBridges.filter(x => x.plugin === plugin.name);
  }

  ngOnDestroy() {
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
    }
    this.io.end();
  }

}
