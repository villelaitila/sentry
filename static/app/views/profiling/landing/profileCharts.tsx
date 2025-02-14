import {useMemo} from 'react';
import {InjectedRouter} from 'react-router';
import {useTheme} from '@emotion/react';
import styled from '@emotion/styled';

import {AreaChart} from 'sentry/components/charts/areaChart';
import ChartZoom from 'sentry/components/charts/chartZoom';
import {HeaderTitle} from 'sentry/components/charts/styles';
import {Panel} from 'sentry/components/panels';
import {t} from 'sentry/locale';
import space from 'sentry/styles/space';
import {PageFilters} from 'sentry/types';
import {Series} from 'sentry/types/echarts';
import {axisLabelFormatter, tooltipFormatter} from 'sentry/utils/discover/charts';
import {aggregateOutputType} from 'sentry/utils/discover/fields';
import {useProfileStats} from 'sentry/utils/profiling/hooks/useProfileStats';

interface ProfileChartsProps {
  query: string;
  router: InjectedRouter;
  selection?: PageFilters;
}

// We want p99 to be before p75 because echarts renders the series in order.
// So if p75 is before p99, p99 will be rendered on top of p75 which will
// cover it up.
const SERIES_ORDER = ['count()', 'p99()', 'p75()'] as const;

export function ProfileCharts({query, router, selection}: ProfileChartsProps) {
  const theme = useTheme();

  const profileStats = useProfileStats({query, selection});
  const series: Series[] = useMemo(() => {
    if (profileStats.type !== 'resolved') {
      return [];
    }

    // the timestamps in the response is in seconds but echarts expects
    // a timestamp in milliseconds, so multiply by 1e3 to do the conversion
    const timestamps = profileStats.data.timestamps.map(ts => ts * 1e3);

    const allSeries = profileStats.data.data
      .filter(rawData => SERIES_ORDER.indexOf(`${rawData.axis}()` as any) > -1)
      .map(rawData => {
        if (timestamps.length !== rawData.values.length) {
          throw new Error('Invalid stats response');
        }

        if (rawData.axis === 'count') {
          return {
            data: rawData.values.map((value, i) => ({
              name: timestamps[i]!,
              // the response value contains nulls when no data is
              // available, use 0 to represent it
              value: value ?? 0,
            })),
            seriesName: `${rawData.axis}()`,
            xAxisIndex: 0,
            yAxisIndex: 0,
          };
        }

        return {
          data: rawData.values.map((value, i) => ({
            name: timestamps[i]!,
            // the response value contains nulls when no data
            // is available, use 0 to represent it
            value: (value ?? 0) / 1e6, // convert ns to ms
          })),
          seriesName: `${rawData.axis}()`,
          xAxisIndex: 1,
          yAxisIndex: 1,
        };
      });

    allSeries.sort((a, b) => {
      const idxA = SERIES_ORDER.indexOf(a.seriesName as any);
      const idxB = SERIES_ORDER.indexOf(b.seriesName as any);

      return idxA - idxB;
    });

    return allSeries;
  }, [profileStats]);

  return (
    <ChartZoom router={router} {...selection?.datetime}>
      {zoomRenderProps => (
        <StyledPanel>
          <TitleContainer>
            <StyledHeaderTitle>{t('Profiles by Count')}</StyledHeaderTitle>
            <StyledHeaderTitle>{t('Profiles by Percentiles')}</StyledHeaderTitle>
          </TitleContainer>
          <AreaChart
            height={300}
            series={series}
            grid={[
              {
                top: '32px',
                left: '24px',
                right: '52%',
                bottom: '16px',
              },
              {
                top: '32px',
                left: '52%',
                right: '24px',
                bottom: '16px',
              },
            ]}
            legend={{
              right: 16,
              top: 12,
              data: SERIES_ORDER.slice(),
            }}
            axisPointer={{
              link: [{xAxisIndex: [0, 1]}],
            }}
            xAxes={[
              {
                gridIndex: 0,
                type: 'time' as const,
              },
              {
                gridIndex: 1,
                type: 'time' as const,
              },
            ]}
            yAxes={[
              {
                gridIndex: 0,
                scale: true,
                axisLabel: {
                  color: theme.chartLabel,
                  formatter(value: number) {
                    return axisLabelFormatter(value, 'integer');
                  },
                },
              },
              {
                gridIndex: 1,
                scale: true,
                axisLabel: {
                  color: theme.chartLabel,
                  formatter(value: number) {
                    return axisLabelFormatter(value, 'duration');
                  },
                },
              },
            ]}
            tooltip={{
              valueFormatter: (value, label) =>
                tooltipFormatter(value, aggregateOutputType(label)),
            }}
            isGroupedByDate
            showTimeInTooltip
            {...zoomRenderProps}
          />
        </StyledPanel>
      )}
    </ChartZoom>
  );
}

const StyledPanel = styled(Panel)`
  padding-top: ${space(2)};
`;

const TitleContainer = styled('div')`
  width: 100%;
  display: flex;
  flex-direction: row;
`;

const StyledHeaderTitle = styled(HeaderTitle)`
  flex-grow: 1;
  margin-left: ${space(2)};
`;
