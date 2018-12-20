import * as React from "react";
import { getConfigManager } from "src/lib/ConfigManager";
import { getNavigationManager } from "src/lib/NavigationManager";
import { getWindowManager, WindowType } from "src/lib/WindowManager";

interface IState {
  navigationOpen: boolean;
}


/**
 * @class Navigation
 * @description toggle sidebar column with nav-links
 */
export class Navigation extends React.Component<{}, IState> {
  private navigationManagerSubscriptionId: number;

  constructor(props: {}) {
    super(props);

    this.state = {
      navigationOpen: false
    };
  }

  public componentDidMount() {
    this.navigationManagerSubscriptionId = getNavigationManager().subscribe("toggle", this.onToggle);
  }

  public componentWillUnmount() {
    getNavigationManager().unsubscribe(this.navigationManagerSubscriptionId);
  }

  public render() {
    const { navigationOpen } = this.state;

    // tslint:disable:jsx-no-lambda
    return (
      <nav
        className="navigation col-md-2 sidebar"
        style={{ marginLeft: navigationOpen ? "0px" : "-300px" }}
      >
        <ul className="nav flex-column">
          {getConfigManager().getResources().map((resource, i) => {
            return (
              <li  key={i} className="nav-item">
                <a
                  href="javascript:void(0)"
                  className="nav-link"
                  onClick={(e) => {
                    getWindowManager().addWindow(`list${resource.id}`, WindowType.List, {
                      breadcrumbs: [],
                      resourceId: resource.id
                    }, [ "breadcrumbs", "resourceId" ]);
                    getWindowManager().saveWindows();
                  }}
                >
                  {resource.namePlural}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  private onToggle = (open: boolean) => {
    this.setState({
      navigationOpen: open
    });
  }
}
