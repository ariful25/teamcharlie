// Real Airbnb host emails (Oct 2026), with guest names, codes, listing ids and
// tracking links replaced. Layout, wording and line breaks are Airbnb's own:
// the readers in lib/reviews/airbnb-email.ts are tested against these.

const FROM = "Airbnb <automated@airbnb.com>";

export const CONFIRMED = {
  from: FROM,
  date: "2026-10-25T23:24:19Z",
  subject: "Reservation confirmed - Dana Kirby arrives Jan 15",
  body: `%opentrack%

NEW BOOKING CONFIRMED! DANA ARRIVES JAN 15.

Send a message to confirm check-in details or welcome Dana.

https://www.airbnb.com/hosting/reservations/details/HMAB12CD34?isPending=true Dana Kirby

                                                                                                     [https://www.airbnb.com/hosting/reservations/details/HMAB12CD34?isPending=true]

                                                                                                     Identity verified · 19 reviews

                                                                                                     Charlotte, NC

Send Dana a MessageSend Dana a Message
[https://www.airbnb.com/hosting/thread/1111111111?thread_type=home_booking]

https://www.airbnb.com/rooms/1500000000000000001?c=x

LUXURY 8BR HOME | HOT TUB | GAME ROOM | SLEEPS 20

Entire home/apt

[https://www.airbnb.com/rooms/1500000000000000001?c=x]

Check-in Checkout

Fri, Jan 15, 2027 Sun, Jan 17, 2027

4:00 PM 11:00 AM

GUESTS

16 adults

CONFIRMATION CODE
HMAB12CD34

GUEST PAID

$1,175.00 x 2 nights $2,350.00
`,
};

export const CANCELLED = {
  from: FROM,
  date: "2026-10-25T20:37:25Z",
  subject: "Canceled: Reservation HMCD34EF56 for October 27 – 29",
  body: `These dates are now open for other guests
%opentrack%

RESERVATION CANCELED

https://www.airbnb.com/hosting/reservations/details/HMCD34EF56?email_cta=link_canceled_reservation_by_guest Serene Ridge Retreat

                                                                       Listing #1400000000000000002

                                                                       Oct 27 – 29, 4 guests

Unfortunately, your guest Theo had to cancel reservation HMCD34EF56 for Oct 27 – 29. Your calendar
has been updated to show that these dates are now available.
According to your cancellation policy, a complete refund was given to the guest.
`,
};

export const CHANGE_REQUEST = {
  from: FROM,
  date: "2026-10-25T21:25:47Z",
  subject: "Rosa wants to change their reservation",
  body: `%opentrack%

ROSA WANTS TO CHANGE THEIR RESERVATION

   ROSA

   Bozeman

   · Mountain View Chalet Near the Peaks

ORIGINAL DATES

Oct 23, 2026 - Oct 26, 2026

REQUESTED DATES

Oct 23, 2026 - Oct 28, 2026

If you accept Rosa’s request, we’ll immediately update the reservation. If you choose to
decline, the reservation will remain unchanged.

Go to request
[https://www.airbnb.com/reservation/alteration/1804000000000000003]
`,
};

export const UPDATED = {
  from: FROM,
  date: "2026-10-25T21:30:46Z",
  subject: "Reservation updated",
  body: `%opentrack%

YOUR RESERVATION WITH ROSA HAS BEEN UPDATED

https://www.airbnb.com/hosting/reservations/details/HMEF56GH78 Rosa

                                                      Bend, OR

                                                      Mountain View Chalet Near the Peaks

                                                      [https://www.airbnb.com/hosting/reservations/details/HMEF56GH78]

We’ve already updated the reservation itinerary. If you have questions, send Rosa a message.
`,
};

export const CHECKOUT = {
  from: FROM,
  date: "2026-10-25T20:18:27Z",
  subject: "Write a review for Lena’s group",
  body: `%opentrack%

HOW WAS LENA'S STAY?

   Tell Lena’s group what you loved and what they can do better

Lena’s group just checked out, so now is the perfect time to
write your review.

Reviews are an important part of the Airbnb community.

Write a review
[https://www.airbnb.com/hosting/reviews/1804000000000000004/edit?allows_redirect=true&entry_source=email]

Honest feedback creates trust-that's why both you and your
guest each review the stay, and feedback won't be shared for
14 days or until both reviews are done.
`,
};

/** The guest reviewed; Airbnb hides the text until we review them too. */
export const WROTE_YOU = {
  from: FROM,
  date: "2026-10-25T15:22:35Z",
  subject: "Priya wrote you a review",
  body: `%opentrack%

FIND OUT WHAT PRIYA WROTE

   Priya

   Oct 23 – 25
   Modern Uptown Retreat | Hot Tub & Game Room

You can read Priya’s review after you write one for
them.

Write a review
[https://www.airbnb.com/hosting/reviews/1804000000000000005/edit?entry_source=email]
`,
};

export const FIVE_STAR = {
  from: FROM,
  date: "2026-10-24T15:56:59Z",
  subject: "Omar left a 5-star review!",
  body: `Read on for a snapshot of what they loved
%opentrack%

OMAR RATED THEIR STAY 5 STARS!

Omar had great things to say about their stay—read on for a
snapshot of what they loved most. Now that the review period
is over, we've posted their review to your Airbnb profile.

FEEDBACK FROM THEIR STAY

   Hot Tub & Sky Views | WoodStove | CountryRetreat

   Oct 7 – 10, 2026

[https://www.airbnb.com/progress/reviews/details/1793000000000000006]

OVERALL RATING 5

This was such an incredible experience! Sam is a
phenomenal host and was so helpful.

SPECIAL THANKS

   Free of clutter

   Pristine kitchen

+6 more

Read full review
[https://www.airbnb.com/users/reviews]
`,
};

export const FOUR_STAR = {
  from: FROM,
  date: "2026-10-07T12:39:03Z",
  subject: "Mike left a 4-star review",
  body: `Check out their full review
%opentrack%

MIKE RATED THEIR STAY 4 STARS

Check out their full review for what went well, plus any
tweaks you can make to your place or listing settings for
next time.

FEEDBACK FROM THEIR STAY

   Uptown Retreat Sleeps 10 w/Hot Tub, BBQ Game Room

   Oct 3 – 5, 2026

[https://www.airbnb.com/progress/reviews/details/1789000000000000007]

OVERALL RATING 4

Overall a pretty good stay. Missed a few key marks (hot tub
not working, WiFi not working) that kept this from being 5
star review. Also the home is + More
[https://www.airbnb.com/progress/reviews/details/1789000000000000007]

Read full review
[https://www.airbnb.com/users/reviews]

GET HELP FROM A CO-HOST

Get started
[https://www.airbnb.com/co-hosts/results?listing_id=1650000000000000008]
`,
};

/** Low ratings come without a name. */
export const ONE_STAR = {
  from: FROM,
  date: "2026-10-06T08:41:19Z",
  subject: "A recent guest left a 1-star review",
  body: `Take a moment to review their feedback
%opentrack%

A RECENT GUEST RATED THEIR STAY 1 STAR

Take a moment to review their feedback. Now’s a good time
to:

   See if there are any improvements you can make for next
   time.

FEEDBACK FROM THEIR STAY

   Serene Ridge Retreat

   Sep 21 – 22, 2026

   Issue reported

[https://www.airbnb.com/progress/reviews/details/1780000000000000009]

OVERALL RATING 1

مش حلو

WHAT TO WORK ON

   Noticeable smell

   Stains
`,
};
