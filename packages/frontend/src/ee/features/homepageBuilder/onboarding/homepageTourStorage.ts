const HOMEPAGE_TOUR_STORAGE_KEY = 'ld.homepage.tour.v1';

export const markHomepageTourSeen = () => {
    try {
        localStorage.setItem(HOMEPAGE_TOUR_STORAGE_KEY, '1');
    } catch {
        // a tour that re-shows is better than a crash
    }
};
