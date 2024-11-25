interface MetricData {
    timestamp: number;
    value: number | null;
    anomaly?: boolean;
}

interface PeriodComparisonData {
    currentPeriod: MetricData[];
    previousPeriod: MetricData[];
}
export const staticMockData: MetricData[] = [
    {
        timestamp: 1709251200000,
        value: 50.0,
    },
    {
        timestamp: 1709337600000,
        value: 52.0,
    },
    {
        timestamp: 1709424000000,
        value: null,
    },
    {
        timestamp: 1709510400000,
        value: 56.0,
    },
    {
        timestamp: 1709596800000,
        value: 58.0,
    },
    {
        timestamp: 1709683200000,
        value: 60.0,
    },
    {
        timestamp: 1709769600000,
        value: 62.0,
    },
    {
        timestamp: 1709856000000,
        value: 60.0,
    },
    {
        timestamp: 1709942400000,
        value: 66.0,
    },
    {
        timestamp: 1710028800000,
        value: 68.0,
    },
    {
        timestamp: 1710115200000,
        value: 50.0,
    },
    {
        timestamp: 1710201600000,
        value: 52.0,
    },
    {
        timestamp: 1710288000000,
        value: 60.0,
    },
    {
        timestamp: 1710374400000,
        value: 56.0,
    },
    {
        timestamp: 1710460800000,
        value: 58.0,
    },
    {
        timestamp: 1710547200000,
        value: 60.0,
    },
    {
        timestamp: 1710633600000,
        value: 62.0,
    },
    {
        timestamp: 1710720000000,
        value: 60.0,
    },
    {
        timestamp: 1710806400000,
        value: 66.0,
    },
    {
        timestamp: 1710892800000,
        value: 68.0,
    },
    {
        timestamp: 1710979200000,
        value: 50.0,
    },
    {
        timestamp: 1711065600000,
        value: 52.0,
    },
    {
        timestamp: 1711152000000,
        value: 60.0,
    },
    {
        timestamp: 1711238400000,
        value: 56.0,
    },
    {
        timestamp: 1711324800000,
        value: 58.0,
    },
    {
        timestamp: 1711411200000,
        value: 60.0,
    },
    {
        timestamp: 1711497600000,
        value: 62.0,
    },
    {
        timestamp: 1711584000000,
        value: 60.0,
    },
    {
        timestamp: 1711670400000,
        value: 66.0,
    },
    {
        timestamp: 1711756800000,
        value: 68.0,
    },
    {
        timestamp: 1711843200000,
        value: 50.0,
    },
    {
        timestamp: 1711929600000,
        value: 52.0,
    },
    {
        timestamp: 1712016000000,
        value: 60.0,
    },
    {
        timestamp: 1712102400000,
        value: 56.0,
    },
    {
        timestamp: 1712188800000,
        value: 58.0,
    },
    {
        timestamp: 1712275200000,
        value: 60.0,
    },
    {
        timestamp: 1712361600000,
        value: 62.0,
    },
    {
        timestamp: 1712448000000,
        value: 60.0,
    },
    {
        timestamp: 1712534400000,
        value: 66.0,
    },
    {
        timestamp: 1712620800000,
        value: 68.0,
    },
    {
        timestamp: 1712707200000,
        value: 50.0,
    },
    {
        timestamp: 1712793600000,
        value: 52.0,
    },
    {
        timestamp: 1712880000000,
        value: 60.0,
    },
    {
        timestamp: 1712966400000,
        value: 56.0,
    },
    {
        timestamp: 1713052800000,
        value: 58.0,
    },
    {
        timestamp: 1713139200000,
        value: 60.0,
    },
    {
        timestamp: 1713225600000,
        value: 62.0,
    },
    {
        timestamp: 1713312000000,
        value: 60.0,
    },
    {
        timestamp: 1713398400000,
        value: 66.0,
    },
    {
        timestamp: 1713484800000,
        value: 68.0,
    },
    {
        timestamp: 1713571200000,
        value: 50.0,
    },
    {
        timestamp: 1713657600000,
        value: 52.0,
    },
    {
        timestamp: 1713744000000,
        value: 60.0,
    },
    {
        timestamp: 1713830400000,
        value: 56.0,
    },
    {
        timestamp: 1713916800000,
        value: 58.0,
    },
    {
        timestamp: 1714003200000,
        value: 60.0,
    },
    {
        timestamp: 1714089600000,
        value: 62.0,
    },
    {
        timestamp: 1714176000000,
        value: 60.0,
    },
    {
        timestamp: 1714262400000,
        value: 66.0,
    },
    {
        timestamp: 1714348800000,
        value: 68.0,
    },
    {
        timestamp: 1714435200000,
        value: 50.0,
    },
    {
        timestamp: 1714521600000,
        value: 52.0,
    },
    {
        timestamp: 1714608000000,
        value: 60.0,
    },
    {
        timestamp: 1714694400000,
        value: 56.0,
    },
    {
        timestamp: 1714780800000,
        value: 58.0,
    },
    {
        timestamp: 1714867200000,
        value: 60.0,
    },
    {
        timestamp: 1714953600000,
        value: 62.0,
    },
    {
        timestamp: 1715040000000,
        value: 60.0,
    },
    {
        timestamp: 1715126400000,
        value: 66.0,
    },
    {
        timestamp: 1715212800000,
        value: 68.0,
    },
    {
        timestamp: 1715299200000,
        value: 50.0,
    },
    {
        timestamp: 1715385600000,
        value: 52.0,
    },
    {
        timestamp: 1715472000000,
        value: 60.0,
    },
    {
        timestamp: 1715558400000,
        value: 56.0,
    },
    {
        timestamp: 1715644800000,
        value: 58.0,
    },
    {
        timestamp: 1715731200000,
        value: 60.0,
    },
    {
        timestamp: 1715817600000,
        value: 62.0,
    },
    {
        timestamp: 1715904000000,
        value: 60.0,
    },
    {
        timestamp: 1715990400000,
        value: 66.0,
    },
    {
        timestamp: 1716076800000,
        value: 68.0,
    },
    {
        timestamp: 1716163200000,
        value: 50.0,
    },
    {
        timestamp: 1716249600000,
        value: 52.0,
    },
    {
        timestamp: 1716336000000,
        value: 60.0,
    },
    {
        timestamp: 1716422400000,
        value: 56.0,
    },
    {
        timestamp: 1716508800000,
        value: 58.0,
    },
    {
        timestamp: 1716595200000,
        value: 60.0,
    },
    {
        timestamp: 1716681600000,
        value: 62.0,
    },
    {
        timestamp: 1716768000000,
        value: 60.0,
    },
    {
        timestamp: 1716854400000,
        value: 66.0,
    },
    {
        timestamp: 1716940800000,
        value: 68.0,
    },
    {
        timestamp: 1717027200000,
        value: 50.0,
    },
    {
        timestamp: 1717113600000,
        value: 52.0,
    },
    {
        timestamp: 1717200000000,
        value: 40,
    },
    {
        timestamp: 1717286400000,
        value: 56.0,
    },
    {
        timestamp: 1717372800000,
        value: 58.0,
    },
    {
        timestamp: 1717459200000,
        value: 60.0,
    },
    {
        timestamp: 1717545600000,
        value: 62.0,
    },
    {
        timestamp: 1717632000000,
        value: null,
    },
    {
        timestamp: 1717718400000,
        value: 66.0,
    },
    {
        timestamp: 1717804800000,
        value: 68.0,
    },
    {
        timestamp: 1717891200000,
        value: 50.0,
    },
    {
        timestamp: 1717977600000,
        value: 52.0,
    },
    {
        timestamp: 1718064000000,
        value: null,
    },
    {
        timestamp: 1718150400000,
        value: 56.0,
    },
    {
        timestamp: 1718236800000,
        value: 58.0,
    },
    {
        timestamp: 1718323200000,
        value: 60.0,
    },
    {
        timestamp: 1718409600000,
        value: 62.0,
    },
    {
        timestamp: 1718496000000,
        value: null,
    },
    {
        timestamp: 1718582400000,
        value: 66.0,
    },
    {
        timestamp: 1718668800000,
        value: 68.0,
    },
    {
        timestamp: 1718755200000,
        value: 50.0,
    },
    {
        timestamp: 1718841600000,
        value: 52.0,
    },
    {
        timestamp: 1718928000000,
        value: null,
    },
    {
        timestamp: 1719014400000,
        value: 56.0,
    },
    {
        timestamp: 1719100800000,
        value: 58.0,
    },
    {
        timestamp: 1719187200000,
        value: 60.0,
    },
    {
        timestamp: 1719273600000,
        value: 62.0,
    },
    {
        timestamp: 1719360000000,
        value: null,
    },
    {
        timestamp: 1719446400000,
        value: 66.0,
    },
    {
        timestamp: 1719532800000,
        value: 68.0,
    },
    {
        timestamp: 1719619200000,
        value: 50.0,
    },
    {
        timestamp: 1719705600000,
        value: 52.0,
    },
    {
        timestamp: 1719792000000,
        value: 40.0,
    },
    {
        timestamp: 1719878400000,
        value: 56.0,
    },
    {
        timestamp: 1719964800000,
        value: 58.0,
    },
    {
        timestamp: 1720051200000,
        value: 60.0,
    },
    {
        timestamp: 1720137600000,
        value: 62.0,
    },
    {
        timestamp: 1720224000000,
        value: 40.0,
    },
    {
        timestamp: 1720310400000,
        value: 66.0,
    },
    {
        timestamp: 1720396800000,
        value: 68.0,
    },
    {
        timestamp: 1720483200000,
        value: 50.0,
    },
    {
        timestamp: 1720569600000,
        value: 52.0,
    },
    {
        timestamp: 1720656000000,
        value: null,
    },
    {
        timestamp: 1720742400000,
        value: 56.0,
    },
    {
        timestamp: 1720828800000,
        value: 58.0,
    },
    {
        timestamp: 1720915200000,
        value: 60.0,
    },
    {
        timestamp: 1721001600000,
        value: 62.0,
    },
    {
        timestamp: 1721088000000,
        value: 40.0,
    },
    {
        timestamp: 1721174400000,
        value: 66.0,
    },
    {
        timestamp: 1721260800000,
        value: 68.0,
    },
    {
        timestamp: 1721347200000,
        value: 50.0,
    },
    {
        timestamp: 1721433600000,
        value: 52.0,
    },
    {
        timestamp: 1721520000000,
        value: 40.0,
    },
    {
        timestamp: 1721606400000,
        value: 56.0,
    },
    {
        timestamp: 1721692800000,
        value: 58.0,
    },
    {
        timestamp: 1721779200000,
        value: 60.0,
    },
    {
        timestamp: 1721865600000,
        value: 62.0,
    },
    {
        timestamp: 1721952000000,
        value: 40.0,
    },
    {
        timestamp: 1722038400000,
        value: 66.0,
    },
    {
        timestamp: 1722124800000,
        value: 68.0,
    },
    {
        timestamp: 1722211200000,
        value: 50.0,
    },
    {
        timestamp: 1722297600000,
        value: 52.0,
    },
    {
        timestamp: 1722384000000,
        value: 40.0,
    },
];

export const staticMockDataPreviousYear: MetricData[] = [
    {
        timestamp: 1677715200000,
        value: 38,
    },
    {
        timestamp: 1677801600000,
        value: null,
    },
    {
        timestamp: 1677888000000,
        value: 40,
    },
    {
        timestamp: 1677974400000,
        value: null,
    },
    {
        timestamp: 1678060800000,
        value: null,
    },
    {
        timestamp: 1678147200000,
        value: null,
    },
    {
        timestamp: 1678233600000,
        value: null,
    },
    {
        timestamp: 1678320000000,
        value: 40,
    },
    {
        timestamp: 1678406400000,
        value: 24,
    },
    {
        timestamp: 1678492800000,
        value: 16,
    },
    {
        timestamp: 1678579200000,
        value: null,
    },
    {
        timestamp: 1678665600000,
        value: 22,
    },
    {
        timestamp: 1678752000000,
        value: null,
    },
    {
        timestamp: 1678838400000,
        value: 20,
    },
    {
        timestamp: 1678924800000,
        value: null,
    },
    {
        timestamp: 1679011200000,
        value: 26,
    },
    {
        timestamp: 1679097600000,
        value: null,
    },
    {
        timestamp: 1679184000000,
        value: 20,
    },
    {
        timestamp: 1679270400000,
        value: 38,
    },
    {
        timestamp: 1679356800000,
        value: 34,
    },
    {
        timestamp: 1679443200000,
        value: 36,
    },
    {
        timestamp: 1679529600000,
        value: 24,
    },
    {
        timestamp: 1679616000000,
        value: null,
    },
    {
        timestamp: 1679702400000,
        value: 22,
    },
    {
        timestamp: 1679788800000,
        value: 32,
    },
    {
        timestamp: 1679875200000,
        value: 32,
    },
    {
        timestamp: 1679961600000,
        value: null,
    },
    {
        timestamp: 1680048000000,
        value: 12,
    },
    {
        timestamp: 1680134400000,
        value: 12,
    },
    {
        timestamp: 1680220800000,
        value: 40,
    },
    {
        timestamp: 1680307200000,
        value: 28,
    },
    {
        timestamp: 1680393600000,
        value: null,
    },
    {
        timestamp: 1680480000000,
        value: 32,
    },
    {
        timestamp: 1680566400000,
        value: null,
    },
    {
        timestamp: 1680652800000,
        value: 36,
    },
    {
        timestamp: 1680739200000,
        value: 22,
    },
    {
        timestamp: 1680825600000,
        value: 20,
    },
    {
        timestamp: 1680912000000,
        value: 22,
    },
    {
        timestamp: 1680998400000,
        value: 20,
    },
    {
        timestamp: 1681084800000,
        value: 40,
    },
    {
        timestamp: 1681171200000,
        value: 28,
    },
    {
        timestamp: 1681257600000,
        value: 12,
    },
    {
        timestamp: 1681344000000,
        value: 38,
    },
    {
        timestamp: 1681430400000,
        value: 34,
    },
    {
        timestamp: 1681516800000,
        value: 30,
    },
    {
        timestamp: 1681603200000,
        value: null,
    },
    {
        timestamp: 1681689600000,
        value: 38,
    },
    {
        timestamp: 1681776000000,
        value: 22,
    },
    {
        timestamp: 1681862400000,
        value: 14,
    },
    {
        timestamp: 1681948800000,
        value: 30,
    },
    {
        timestamp: 1682035200000,
        value: 34,
    },
    {
        timestamp: 1682121600000,
        value: null,
    },
    {
        timestamp: 1682208000000,
        value: 16,
    },
    {
        timestamp: 1682294400000,
        value: null,
    },
    {
        timestamp: 1682380800000,
        value: 20,
    },
    {
        timestamp: 1682467200000,
        value: 38,
    },
    {
        timestamp: 1682553600000,
        value: 12,
    },
    {
        timestamp: 1682640000000,
        value: null,
    },
    {
        timestamp: 1682726400000,
        value: 22,
    },
    {
        timestamp: 1682812800000,
        value: 30,
    },
    {
        timestamp: 1682899200000,
        value: 24,
    },
    {
        timestamp: 1682985600000,
        value: 22,
    },
    {
        timestamp: 1683072000000,
        value: 14,
    },
    {
        timestamp: 1683158400000,
        value: 10,
    },
    {
        timestamp: 1683244800000,
        value: 36,
    },
    {
        timestamp: 1683331200000,
        value: 38,
    },
    {
        timestamp: 1683417600000,
        value: 28,
    },
    {
        timestamp: 1683504000000,
        value: 18,
    },
    {
        timestamp: 1683590400000,
        value: 14,
    },
    {
        timestamp: 1683676800000,
        value: 40,
    },
    {
        timestamp: 1683763200000,
        value: null,
    },
    {
        timestamp: 1683849600000,
        value: 18,
    },
    {
        timestamp: 1683936000000,
        value: 20,
    },
    {
        timestamp: 1684022400000,
        value: 22,
    },
    {
        timestamp: 1684108800000,
        value: 18,
    },
    {
        timestamp: 1684195200000,
        value: null,
    },
    {
        timestamp: 1684281600000,
        value: 26,
    },
    {
        timestamp: 1684368000000,
        value: null,
    },
    {
        timestamp: 1684454400000,
        value: 22,
    },
    {
        timestamp: 1684540800000,
        value: 20,
    },
    {
        timestamp: 1684627200000,
        value: null,
    },
    {
        timestamp: 1684713600000,
        value: 10,
    },
    {
        timestamp: 1684800000000,
        value: 32,
    },
    {
        timestamp: 1684886400000,
        value: 28,
    },
    {
        timestamp: 1684972800000,
        value: 36,
    },
    {
        timestamp: 1685059200000,
        value: 34,
    },
    {
        timestamp: 1685145600000,
        value: 18,
    },
    {
        timestamp: 1685232000000,
        value: 16,
    },
    {
        timestamp: 1685318400000,
        value: 24,
    },
    {
        timestamp: 1685404800000,
        value: 38,
    },
    {
        timestamp: 1685491200000,
        value: null,
    },
    {
        timestamp: 1685577600000,
        value: 12,
    },
    {
        timestamp: 1685664000000,
        value: null,
    },
    {
        timestamp: 1685750400000,
        value: 26,
    },
    {
        timestamp: 1685836800000,
        value: 24,
    },
    {
        timestamp: 1685923200000,
        value: 24,
    },
    {
        timestamp: 1686009600000,
        value: 12,
    },
    {
        timestamp: 1686096000000,
        value: 12,
    },
    {
        timestamp: 1686182400000,
        value: null,
    },
    {
        timestamp: 1686268800000,
        value: 24,
    },
    {
        timestamp: 1686355200000,
        value: 32,
    },
    {
        timestamp: 1686441600000,
        value: 12,
    },
    {
        timestamp: 1686528000000,
        value: 16,
    },
    {
        timestamp: 1686614400000,
        value: null,
    },
    {
        timestamp: 1686700800000,
        value: null,
    },
    {
        timestamp: 1686787200000,
        value: 40,
    },
    {
        timestamp: 1686873600000,
        value: null,
    },
    {
        timestamp: 1686960000000,
        value: null,
    },
    {
        timestamp: 1687046400000,
        value: null,
    },
    {
        timestamp: 1687132800000,
        value: 14,
    },
    {
        timestamp: 1687219200000,
        value: 22,
    },
    {
        timestamp: 1687305600000,
        value: 12,
    },
    {
        timestamp: 1687392000000,
        value: 24,
    },
    {
        timestamp: 1687478400000,
        value: 26,
    },
    {
        timestamp: 1687564800000,
        value: 40,
    },
    {
        timestamp: 1687651200000,
        value: 10,
    },
    {
        timestamp: 1687737600000,
        value: 16,
    },
    {
        timestamp: 1687824000000,
        value: 14,
    },
    {
        timestamp: 1687910400000,
        value: 30,
    },
    {
        timestamp: 1687996800000,
        value: 12,
    },
    {
        timestamp: 1688083200000,
        value: null,
    },
    {
        timestamp: 1688169600000,
        value: null,
    },
    {
        timestamp: 1688256000000,
        value: null,
    },
    {
        timestamp: 1688342400000,
        value: 18,
    },
    {
        timestamp: 1688428800000,
        value: 18,
    },
    {
        timestamp: 1688515200000,
        value: 10,
    },
    {
        timestamp: 1688601600000,
        value: 36,
    },
    {
        timestamp: 1688688000000,
        value: 40,
    },
    {
        timestamp: 1688774400000,
        value: 38,
    },
    {
        timestamp: 1688860800000,
        value: 36,
    },
    {
        timestamp: 1688947200000,
        value: null,
    },
    {
        timestamp: 1689033600000,
        value: 32,
    },
    {
        timestamp: 1689120000000,
        value: 30,
    },
    {
        timestamp: 1689206400000,
        value: 16,
    },
    {
        timestamp: 1689292800000,
        value: 26,
    },
    {
        timestamp: 1689379200000,
        value: 30,
    },
    {
        timestamp: 1689465600000,
        value: null,
    },
    {
        timestamp: 1689552000000,
        value: 20,
    },
    {
        timestamp: 1689638400000,
        value: 40,
    },
    {
        timestamp: 1689724800000,
        value: 14,
    },
    {
        timestamp: 1689811200000,
        value: 16,
    },
    {
        timestamp: 1689897600000,
        value: 28,
    },
    {
        timestamp: 1689984000000,
        value: null,
    },
    {
        timestamp: 1690070400000,
        value: 12,
    },
    {
        timestamp: 1690156800000,
        value: 38,
    },
    {
        timestamp: 1690243200000,
        value: 10,
    },
    {
        timestamp: 1690329600000,
        value: 34,
    },
    {
        timestamp: 1690416000000,
        value: 36,
    },
    {
        timestamp: 1690502400000,
        value: null,
    },
    {
        timestamp: 1690588800000,
        value: 28,
    },
    {
        timestamp: 1690675200000,
        value: 40,
    },
    {
        timestamp: 1690761600000,
        value: null,
    },
    {
        timestamp: 1690848000000,
        value: 16,
    },
];
export const generatePeriodComparisonData = (): PeriodComparisonData => {
    const now = Date.now();
    const currentPeriod: MetricData[] = [];
    const previousPeriod: MetricData[] = [];
    const daysToGenerate = 30;

    for (let i = 0; i < daysToGenerate; i++) {
        const timestamp = now - (daysToGenerate - i) * 24 * 60 * 60 * 1000;
        const baseValue = 50 + Math.sin(i / 5) * 20;
        const noise = Math.random() * 5;

        const hasGap = Math.random() < 0.05;
        const value = hasGap ? null : baseValue + noise;
        const isAnomaly = !hasGap && Math.random() < 0.1;

        currentPeriod.push({
            timestamp,
            value,
            anomaly: isAnomaly,
        });

        const previousTimestamp =
            timestamp - daysToGenerate * 24 * 60 * 60 * 1000;
        const previousBaseValue = baseValue * (0.8 + Math.random() * 0.4);

        previousPeriod.push({
            timestamp: previousTimestamp,
            value: previousBaseValue + Math.random() * 5,
            anomaly: Math.random() < 0.1,
        });
    }

    return {
        currentPeriod,
        previousPeriod,
    };
};

export const generateMockData = () => {
    return generatePeriodComparisonData().currentPeriod;
};
